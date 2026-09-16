import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, prisma } from "../src/core/prisma.js";
import { addMinutes, computeWindow } from "../src/core/time.js";
import { buildPreorder } from "../src/modules/menu/menu.service.js";
import { createTestRoom, loginAs, uid } from "./helpers.js";

const app = createApp();

async function createMenuTestBooking(status: "CONFIRMED" | "IN_USE") {
  const room = await createTestRoom();
  const startAt = addMinutes(new Date(), status === "IN_USE" ? -30 : 60);
  const window = computeWindow(startAt, 120);

  return prisma.booking.create({
    data: {
      code: `MENU-${uid()}`,
      roomId: room.id,
      contactName: "Menu Test Customer",
      contactPhone: "0900000000",
      guestCount: 2,
      startAt: window.startAt,
      endAt: window.endAt,
      occupiedUntil: window.occupiedUntil,
      status,
      checkedInAt: status === "IN_USE" ? startAt : null,
      roomRateSnapshot: 100_000,
      roomTotal: 200_000,
    },
  });
}

describe("Module 5 - menu and pre-orders", () => {
  afterAll(closeDb);

  it("GET /menu-items returns only active items", async () => {
    const activeName = `Active-${uid()}`;
    const inactiveName = `Inactive-${uid()}`;

    await prisma.menuItem.createMany({
      data: [
        {
          name: activeName,
          category: "DRINK",
          priceVnd: 25_000,
          isActive: true,
        },
        {
          name: inactiveName,
          category: "FOOD",
          priceVnd: 50_000,
          isActive: false,
        },
      ],
    });

    const response = await request(app).get("/api/menu-items");

    expect(response.status).toBe(200);

    const names = response.body.data.map((item: { name: string }) => item.name);

    expect(names).toContain(activeName);
    expect(names).not.toContain(inactiveName);
  });

  it("buildPreorder uses the name and price stored in the database", async () => {
    const item = await prisma.menuItem.create({
      data: {
        name: `Snapshot-${uid()}`,
        category: "SNACK",
        priceVnd: 40_000,
        isActive: true,
      },
    });

    const preorder = await prisma.$transaction((tx) =>
      buildPreorder(tx, [
        {
          menuItemId: item.id,
          quantity: 2,
        },
      ]),
    );

    expect(preorder.lines).toEqual([
      {
        menuItemId: item.id,
        itemNameSnapshot: item.name,
        unitPriceVnd: 40_000,
        quantity: 2,
      },
    ]);

    expect(preorder.totalVnd).toBe(80_000);

    await prisma.menuItem.update({
      where: { id: item.id },
      data: {
        priceVnd: 55_000,
      },
    });

    expect(preorder.lines[0]?.unitPriceVnd).toBe(40_000);
  });

  it.each([0, 21, 1.5])("rejects invalid quantity %s", async (quantity) => {
    const item = await prisma.menuItem.create({
      data: {
        name: `Quantity-${quantity}-${uid()}`,
        category: "DRINK",
        priceVnd: 30_000,
        isActive: true,
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        buildPreorder(tx, [
          {
            menuItemId: item.id,
            quantity,
          },
        ]),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_QUANTITY",
    });
  });

  it("rejects an inactive menu item", async () => {
    const item = await prisma.menuItem.create({
      data: {
        name: `Unavailable-${uid()}`,
        category: "FOOD",
        priceVnd: 60_000,
        isActive: false,
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        buildPreorder(tx, [
          {
            menuItemId: item.id,
            quantity: 1,
          },
        ]),
      ),
    ).rejects.toMatchObject({
      code: "MENU_ITEM_UNAVAILABLE",
    });
  });

  it("allows staff to process an order from PENDING to SERVED", async () => {
    const staff = await loginAs(app, "STAFF");
    const booking = await createMenuTestBooking("IN_USE");

    const item = await prisma.menuItem.create({
      data: {
        name: `Lifecycle-${uid()}`,
        category: "FOOD",
        priceVnd: 45_000,
        isActive: true,
      },
    });

    const added = await staff.agent.post(`/api/staff/bookings/${booking.id}/orders`).send({
      items: [
        {
          menuItemId: item.id,
          quantity: 2,
        },
      ],
    });

    expect(added.status).toBe(201);
    expect(added.body.data.status).toBe("PENDING");

    expect(added.body.data.items[0]).toMatchObject({
      itemNameSnapshot: item.name,
      unitPriceVnd: 45_000,
      quantity: 2,
    });

    const preparing = await staff.agent.patch(`/api/staff/orders/${added.body.data.id}/status`).send({
      status: "PREPARING",
    });

    expect(preparing.status).toBe(200);
    expect(preparing.body.data.status).toBe("PREPARING");

    const served = await staff.agent.patch(`/api/staff/orders/${added.body.data.id}/status`).send({
      status: "SERVED",
    });

    expect(served.status).toBe(200);
    expect(served.body.data.status).toBe("SERVED");

    const invalid = await staff.agent.patch(`/api/staff/orders/${added.body.data.id}/status`).send({
      status: "CANCELLED",
    });

    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe("INVALID_ORDER_TRANSITION");
  });

  it("rejects processing food orders when the booking is not in use", async () => {
    const staff = await loginAs(app, "STAFF");
    const confirmedBooking = await createMenuTestBooking("CONFIRMED");

    const item = await prisma.menuItem.create({
      data: {
        name: `Not-In-Use-${uid()}`,
        category: "DRINK",
        priceVnd: 30_000,
        isActive: true,
      },
    });

    const rejectedAdd = await staff.agent.post(`/api/staff/bookings/${confirmedBooking.id}/orders`).send({
      items: [
        {
          menuItemId: item.id,
          quantity: 1,
        },
      ],
    });

    expect(rejectedAdd.status).toBe(409);
    expect(rejectedAdd.body.error.code).toBe("NOT_IN_USE");

    const inUseBooking = await createMenuTestBooking("IN_USE");

    const added = await staff.agent.post(`/api/staff/bookings/${inUseBooking.id}/orders`).send({
      items: [
        {
          menuItemId: item.id,
          quantity: 1,
        },
      ],
    });

    expect(added.status).toBe(201);

    const preparing = await staff.agent.patch(`/api/staff/orders/${added.body.data.id}/status`).send({
      status: "PREPARING",
    });

    expect(preparing.status).toBe(200);

    await prisma.booking.update({
      where: {
        id: inUseBooking.id,
      },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
      },
    });

    const rejectedServe = await staff.agent.patch(`/api/staff/orders/${added.body.data.id}/status`).send({
      status: "SERVED",
    });

    expect(rejectedServe.status).toBe(409);
    expect(rejectedServe.body.error.code).toBe("NOT_IN_USE");
  });

  it("allows only managers to create, update, and deactivate menu items", async () => {
    const manager = await loginAs(app, "MANAGER");
    const staff = await loginAs(app, "STAFF");
    const itemName = `Admin-CRUD-${uid()}`;

    const forbidden = await staff.agent.get("/api/admin/menu-items");
    expect(forbidden.status).toBe(403);

    const created = await manager.agent.post("/api/admin/menu-items").send({
      name: itemName,
      category: "DRINK",
      imageUrl: null,
      priceVnd: 42_000,
      isActive: true,
    });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: itemName,
      priceVnd: 42_000,
      isActive: true,
    });

    const publicBefore = await request(app).get("/api/menu-items");
    expect(publicBefore.body.data.some((item: { id: number }) => item.id === created.body.data.id)).toBe(true);

    const updated = await manager.agent.patch(`/api/admin/menu-items/${created.body.data.id}`).send({
      priceVnd: 45_000,
      isActive: false,
    });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      id: created.body.data.id,
      priceVnd: 45_000,
      isActive: false,
    });

    const adminList = await manager.agent.get("/api/admin/menu-items");
    expect(adminList.body.data.some((item: { id: number; isActive: boolean }) => item.id === created.body.data.id && !item.isActive)).toBe(
      true,
    );

    const publicAfter = await request(app).get("/api/menu-items");
    expect(publicAfter.body.data.some((item: { id: number }) => item.id === created.body.data.id)).toBe(false);
  });
});
