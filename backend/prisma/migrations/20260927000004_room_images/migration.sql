-- Keep the shared demo room covers consistent on every development database.
DELETE FROM "room_image"
WHERE "room_id" IN (
  SELECT "id"
  FROM "room"
  WHERE "name" IN (
    'Room 101 – Classic',
    'Room 102 – Classic',
    'Room 103 – Classic',
    'Room 201 – Queen',
    'Room 202 – Queen',
    'Room 203 – Queen',
    'Room 301 – King',
    'Room 302 – King',
    'Room 401 – Group',
    'Room 402 – Group'
  )
);

INSERT INTO "room_image" ("room_id", "url", "sort_order")
SELECT room."id", image."url", 0
FROM (
  VALUES
    ('Room 101 – Classic', 'https://blog.dktcdn.net/files/cafe-phim-1.jpg'),
    ('Room 102 – Classic', 'https://down-vn.img.susercontent.com/vn-11134259-7r98o-lwwokehuptcp02'),
    ('Room 103 – Classic', 'https://blog.dktcdn.net/files/cafe-phim-6.jpg'),
    ('Room 201 – Queen', 'https://leuvit.com/wp-content/uploads/2023/07/Leu-Vit-Homestay-Diem-danh-dia-chi-cafe-phim-Hai-Phong-duoc-gioi-tre-yeu-thich-nhat-3.jpg'),
    ('Room 202 – Queen', 'https://cdn.xanhsm.com/2024/12/8cb7f72c-cafe-film-3d-box-7.jpg'),
    ('Room 203 – Queen', 'https://www.cukcuk.vn/wp-content/uploads/2023/06/mo-hinh-cafe-phim.png'),
    ('Room 301 – King', 'https://cdn.xanhsm.com/2024/12/ac7991f9-cafe-phim-cau-giay-thumb.jpeg'),
    ('Room 302 – King', 'https://roomstyle.decorexpro.com/wp-content/uploads/2018/02/dizajn-domashnego-kinoteatra-13.jpg'),
    ('Room 401 – Group', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRjSpQy2fzzEqF89SRwwJOIxEIIrx-gp7u-TwmQNSHr8BeFTnsZqDO14qN5&s=10'),
    ('Room 402 – Group', 'https://anhtaiaudio.com.vn/wp-content/uploads/2021/05/chieu-phim-tai-gia-7-1.jpg')
) AS image("room_name", "url")
JOIN "room" room ON room."name" = image."room_name";
