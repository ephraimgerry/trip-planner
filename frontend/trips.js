// Seed-only: a sample trip for local testing, read by backend/scripts/seed.js.
// Hotels are places (kind 'lodging'); a stay points at one by id.

const HOTELS = [
  { id: "amara-signature-shanghai", name: "Amara Signature Shanghai", city: "shanghai", lat: 31.2425, lng: 121.4405, address: "600 Changshou Rd, Putuo District, Shanghai 200060" },
  { id: "ji-hotel-suzhou-guanqian", name: "JI Hotel Suzhou (Guanqian St)", cn: "全季酒店 苏州观前街店", city: "suzhou", lat: 31.311, lng: 120.626, address: "57-69 Guanqian St, Gusu District, Suzhou 215000" },
  { id: "atour-hotel-pinghai-road", name: "Atour Hotel (Pinghai Rd)", cn: "亚朵酒店 杭州平海路店", city: "hangzhou", lat: 30.2562, lng: 120.1668, address: "8 Pinghai Rd, Hubin, Shangcheng District, Hangzhou 310006" },
  { id: "club-med-urban-oasis-hangzhou", name: "Club Med Urban Oasis Hangzhou", city: "hangzhou", lat: 30.178, lng: 120.075, address: "200 Caiqing Rd, Xihu District, Hangzhou" },
  { id: "urcove-shanghai-the-bund", name: "Urcove Shanghai on the Bund", cn: "上海外滩逸扉酒店", city: "shanghai", lat: 31.2335, lng: 121.492, address: "15 Zhongshan East 2nd Rd, Huangpu District, Shanghai 200002" },
];

// { date: { slot: [placeId, ...] } } -> trip_items rows, in visiting order
function plan(days) {
  return Object.entries(days).flatMap(([date, slots]) =>
    ["morning", "noon", "evening"].flatMap(slot => (slots[slot] || []).map(placeId => ({ date, slot, placeId }))));
}

// Shape matches the PUT /api/trips/:id/plan body. Created once; a re-seed
// leaves an existing trip alone so edits made in the app survive.
const TRIPS = [
  {
    id: "trip-shanghai-nov-2026",
    name: "Shanghai · Suzhou · Hangzhou",
    startDate: "2026-11-07",
    endDate: "2026-11-21",
    stays: [
      { areaId: "shanghai", placeId: "amara-signature-shanghai",      checkIn: "2026-11-07", checkOut: "2026-11-12" },
      { areaId: "suzhou",   placeId: "ji-hotel-suzhou-guanqian",      checkIn: "2026-11-12", checkOut: "2026-11-13" },
      { areaId: "hangzhou", placeId: "atour-hotel-pinghai-road",      checkIn: "2026-11-13", checkOut: "2026-11-15" },
      { areaId: "hangzhou", placeId: "club-med-urban-oasis-hangzhou", checkIn: "2026-11-15", checkOut: "2026-11-16" },
      { areaId: "shanghai", placeId: "urcove-shanghai-the-bund",      checkIn: "2026-11-16", checkOut: "2026-11-21" },
    ],
    // inter-city transit isn't decided yet, so only the flights are here
    commutes: [
      { kind: "flight", direction: "outbound", operator: "Singapore Airlines", code: "SQ 836", status: "planned",
        startDate: "2026-11-07", startTime: "17:00", endDate: "2026-11-07", endTime: "22:20",
        fromLabel: "Singapore Changi (SIN)", toLabel: "Shanghai Pudong (PVG)" },
      { kind: "flight", direction: "inbound", operator: "Singapore Airlines", code: "SQ 827", status: "planned",
        startDate: "2026-11-21", startTime: "08:20", endDate: "2026-11-21", endTime: "14:10",
        fromLabel: "Shanghai Pudong (PVG)", toLabel: "Singapore Changi (SIN)" },
    ],
    // One neighbourhood per day, so no area is revisited the next day. The
    // French Concession gets two (west, east) because most of the cafes are there.
    items: plan({
      // Suzhou Creek and north Jing'an, close to the Putuo hotel
      "2026-11-08": { morning: ["m50", "d-orino-coffee"],
                      noon:    ["1000-trees", "loop-lab", "nat-history"],
                      evening: ["kaisha"] },
      // French Concession west: Zhongshan Park, Wukang Rd, Anfu Rd
      "2026-11-09": { morning: ["cubic3-zhaofeng-plaza", "zhongshan-park"],
                      noon:    ["wukang-mansion", "arabica-wukang-road", "ferguson-lane", "columbia-circle"],
                      evening: ["anfu-road", "penicillin-shanghai"] },
      // Jing'an Temple to People's Square (a Tuesday: Shanghai Museum shuts Mondays)
      "2026-11-10": { morning: ["jingan-temple", "zhang-garden", "blue-bottle-coffee-zhangyu"],
                      noon:    ["shanghai-museum", "peoples-square", "yangs-dumplings"],
                      evening: ["ah-ma-handmade-raffles", "nanjing-rd"] },
      // French Concession east: Taiyuan Rd, Yongkang Rd, Tianzifang, Xintiandi
      "2026-11-11": { morning: ["three-and-a-half-coffee", "tianzifang"],
                      noon:    ["chifane-yongkang", "sinan-mansions", "gluglu"],
                      evening: ["xintiandi", "speak-low"] },
      // Suzhou, northern old town, after the morning train
      "2026-11-12": { noon:    ["humble-administrator-s-gar", "suzhou-museum", "lion-grove-garden", "caojie-coffee"],
                      evening: ["pingjiang-road", "songhelou-restaurant"] },
      // Suzhou south in the morning, then Hangzhou around the Hubin hotel
      "2026-11-13": { morning: ["tongdexing-noodle-house", "master-of-the-nets-garden", "green-dog-coffee"],
                      evening: ["wushan-chenghuang-pavilion", "hefang-street-qinghefang"] },
      // West Lake, north shore to south
      "2026-11-14": { morning: ["xinfeng-snacks", "broken-bridge", "bai-causeway", "baoshi-mountain-baochu-pag"],
                      noon:    ["louwailou", "su-causeway"],
                      evening: ["leifeng-pagoda"] },
      // West hills, ending near Club Med
      "2026-11-15": { morning: ["lingyin-temple", "feilai-feng"],
                      noon:    ["longjing-tea-village", "green-tea-restaurant-origi", "china-academy-of-art-xiang"] },
      // back in Shanghai; the Bund is outside the hotel
      "2026-11-16": { evening: ["the-bund", "lost-heaven", "author-s-room-by-naive"] },
      // Lujiazui
      "2026-11-17": { morning: ["museum-of-art-pudong-map", "wuxie"],
                      noon:    ["shanghai-tower", "minsheng-wharf-80-000-ton-"],
                      evening: ["lujiazui"] },
      // Hongkou and the mouth of Suzhou Creek
      "2026-11-18": { morning: ["rockbund", "shanghai-post-museum", "shenyuli-shikumen-lane"],
                      noon:    ["people-s-coffee", "fotografiska-shanghai", "suhewan-mixc"],
                      evening: ["1933", "north-bund"] },
      // Xujiahui and the West Bund
      "2026-11-19": { morning: ["xujiahui-cathedral", "jiushi-ye"],
                      noon:    ["long-museum", "west-bund", "tank-shanghai"],
                      evening: ["ren-he-guan"] },
      // Old City, near the hotel before the early flight
      "2026-11-20": { morning: ["yu-garden", "yuyuan-bazaar", "nanxiang"],
                      noon:    ["zhongyaotang-gelato", "sipailou-road-snack-street"],
                      evening: ["shouning-road-crayfish-stree"] },
    }),
  },
];
