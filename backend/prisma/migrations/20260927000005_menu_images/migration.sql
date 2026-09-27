-- Point existing demo menu items at the shared images committed with the frontend.
UPDATE "menu_item" AS item
SET "image_url" = image."url"
FROM (
  VALUES
    ('Peach orange lemongrass tea', '/images/menu/peach-orange-lemongrass-tea.jpg'),
    ('Pearl milk tea', '/images/menu/pearl-milk-tea.jpg'),
    ('Vietnamese iced coffee', '/images/menu/vietnamese-iced-coffee.jpg'),
    ('Hot cocoa', '/images/menu/hot-cocoa.jpg'),
    ('Orange juice', '/images/menu/orange-juice.jpg'),
    ('Blueberry soda', '/images/menu/blueberry-soda.jpg'),
    ('Butter popcorn', '/images/menu/butter-popcorn.jpg'),
    ('French fries', '/images/menu/french-fries.jpg'),
    ('Chicken skewers', '/images/menu/chicken-skewers.jpg'),
    ('Fried fermented pork rolls', '/images/menu/fried-fermented-pork-rolls.jpg'),
    ('Grilled sausage', '/images/menu/grilled-sausage.jpg'),
    ('Mini pizza', '/images/menu/mini-pizza.jpg'),
    ('Beef spaghetti', '/images/menu/beef-spaghetti.jpg'),
    ('Grilled beef baguette', '/images/menu/grilled-beef-baguette.jpg'),
    ('Popcorn + 2 drinks combo', '/images/menu/popcorn-two-drinks-combo.jpg')
) AS image("name", "url")
WHERE item."name" = image."name";
