-- =============================================================================
--  005 — Japan and Vietnam
--
--  Reference geography ships as a migration, not as seed data, so every
--  deployment has the same country and area ids no matter when it was set up.
--  Areas are upserted by id: re-running never duplicates, and a later migration
--  can correct a coordinate without touching anyone's places or trips.
--
--  `kind` distinguishes a city you stay in from a province you range around;
--  `zoom` is the sensible opening zoom for that area on the map.
-- =============================================================================

INSERT INTO countries (code,name,name_local,created_at) VALUES
  ('jp','Japan',  '日本',      datetime('now')),
  ('vn','Vietnam','Việt Nam', datetime('now'))
ON CONFLICT(code) DO UPDATE SET name = excluded.name, name_local = excluded.name_local;

-- ---------------------------------------------------------------- Japan
INSERT INTO areas (id,country_code,name,name_local,kind,lat,lng,zoom,created_at) VALUES
  ('tokyo',       'jp','Tokyo',        '東京',       'city',     35.6762, 139.6503, 11, datetime('now')),
  ('kyoto',       'jp','Kyoto',        '京都',       'city',     35.0116, 135.7681, 12, datetime('now')),
  ('osaka',       'jp','Osaka',        '大阪',       'city',     34.6937, 135.5023, 12, datetime('now')),
  ('nara',        'jp','Nara',         '奈良',       'city',     34.6851, 135.8048, 13, datetime('now')),
  ('kobe',        'jp','Kobe',         '神戸',       'city',     34.6901, 135.1955, 12, datetime('now')),
  ('yokohama',    'jp','Yokohama',     '横浜',       'city',     35.4437, 139.6380, 12, datetime('now')),
  ('nagoya',      'jp','Nagoya',       '名古屋',     'city',     35.1815, 136.9066, 12, datetime('now')),
  ('kanazawa',    'jp','Kanazawa',     '金沢',       'city',     36.5613, 136.6562, 13, datetime('now')),
  ('takayama',    'jp','Takayama',     '高山',       'city',     36.1461, 137.2521, 13, datetime('now')),
  ('hakone',      'jp','Hakone',       '箱根',       'region',   35.2324, 139.1069, 12, datetime('now')),
  ('nikko',       'jp','Nikko',        '日光',       'city',     36.7198, 139.6982, 12, datetime('now')),
  ('kamakura',    'jp','Kamakura',     '鎌倉',       'city',     35.3192, 139.5467, 13, datetime('now')),
  ('fuji-kawaguchiko','jp','Fuji Five Lakes','富士五湖','region', 35.4972, 138.7534, 11, datetime('now')),
  ('hiroshima',   'jp','Hiroshima',    '広島',       'city',     34.3853, 132.4553, 12, datetime('now')),
  ('fukuoka',     'jp','Fukuoka',      '福岡',       'city',     33.5904, 130.4017, 12, datetime('now')),
  ('beppu',       'jp','Beppu',        '別府',       'city',     33.2846, 131.4914, 13, datetime('now')),
  ('sendai',      'jp','Sendai',       '仙台',       'city',     38.2682, 140.8694, 12, datetime('now')),
  ('hokkaido',    'jp','Hokkaido',     '北海道',     'province', 43.2203, 142.8635,  7, datetime('now')),
  ('sapporo',     'jp','Sapporo',      '札幌',       'city',     43.0618, 141.3545, 12, datetime('now')),
  ('otaru',       'jp','Otaru',        '小樽',       'city',     43.1907, 140.9947, 13, datetime('now')),
  ('hakodate',    'jp','Hakodate',     '函館',       'city',     41.7688, 140.7288, 12, datetime('now')),
  ('okinawa',     'jp','Okinawa',      '沖縄',       'province', 26.5013, 127.9455,  9, datetime('now')),
  ('naha',        'jp','Naha',         '那覇',       'city',     26.2124, 127.6809, 12, datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  country_code = excluded.country_code, name = excluded.name, name_local = excluded.name_local,
  kind = excluded.kind, lat = excluded.lat, lng = excluded.lng, zoom = excluded.zoom;

-- --------------------------------------------------------------- Vietnam
INSERT INTO areas (id,country_code,name,name_local,kind,lat,lng,zoom,created_at) VALUES
  ('hanoi',      'vn','Hanoi',            'Hà Nội',        'city',   21.0278, 105.8342, 12, datetime('now')),
  ('ho-chi-minh','vn','Ho Chi Minh City', 'Thành phố Hồ Chí Minh','city', 10.7769, 106.7009, 12, datetime('now')),
  ('da-nang',    'vn','Da Nang',          'Đà Nẵng',       'city',   16.0544, 108.2022, 12, datetime('now')),
  ('hoi-an',     'vn','Hoi An',           'Hội An',        'city',   15.8801, 108.3380, 14, datetime('now')),
  ('hue',        'vn','Hue',              'Huế',           'city',   16.4637, 107.5909, 13, datetime('now')),
  ('ha-long',    'vn','Ha Long Bay',      'Vịnh Hạ Long',  'region', 20.9101, 107.1839, 11, datetime('now')),
  ('ninh-binh',  'vn','Ninh Binh',        'Ninh Bình',     'region', 20.2506, 105.9745, 12, datetime('now')),
  ('sapa',       'vn','Sapa',             'Sa Pa',         'city',   22.3364, 103.8438, 13, datetime('now')),
  ('ha-giang',   'vn','Ha Giang',         'Hà Giang',      'province',22.8233, 104.9836, 9, datetime('now')),
  ('phong-nha',  'vn','Phong Nha',        'Phong Nha',     'region', 17.5906, 106.2830, 12, datetime('now')),
  ('nha-trang',  'vn','Nha Trang',        'Nha Trang',     'city',   12.2388, 109.1967, 12, datetime('now')),
  ('da-lat',     'vn','Da Lat',           'Đà Lạt',        'city',   11.9404, 108.4583, 13, datetime('now')),
  ('mui-ne',     'vn','Mui Ne',           'Mũi Né',        'region', 10.9333, 108.2875, 13, datetime('now')),
  ('quy-nhon',   'vn','Quy Nhon',         'Quy Nhơn',      'city',   13.7829, 109.2196, 12, datetime('now')),
  ('phu-quoc',   'vn','Phu Quoc',         'Phú Quốc',      'region', 10.2899, 103.9840, 11, datetime('now')),
  ('can-tho',    'vn','Can Tho',          'Cần Thơ',       'city',   10.0452, 105.7469, 12, datetime('now')),
  ('hai-phong',  'vn','Hai Phong',        'Hải Phòng',     'city',   20.8449, 106.6881, 12, datetime('now')),
  ('con-dao',    'vn','Con Dao',          'Côn Đảo',       'region',  8.6833, 106.6000, 12, datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  country_code = excluded.country_code, name = excluded.name, name_local = excluded.name_local,
  kind = excluded.kind, lat = excluded.lat, lng = excluded.lng, zoom = excluded.zoom;
