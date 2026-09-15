import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, prisma } from "../src/core/prisma.js";
import { buildPreorder } from "../src/modules/menu/menu.service.js";
import { uid } from "./helpers.js";

const app = createApp();

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
      data: { priceVnd: 55_000 },
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
});
