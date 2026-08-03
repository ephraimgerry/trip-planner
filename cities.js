// City + district config. DISTRICTS.adcode links to a polygon in districts-geo.js.
var CITIES = {
  "shanghai": {
    "name": "Shanghai",
    "cn": "上海",
    "center": [
      31.235,
      121.49
    ],
    "zoom": 11
  },
  "suzhou": {
    "name": "Suzhou",
    "cn": "苏州",
    "center": [
      31.31,
      120.62
    ],
    "zoom": 11
  },
  "hangzhou": {
    "name": "Hangzhou",
    "cn": "杭州",
    "center": [
      30.26,
      120.15
    ],
    "zoom": 11
  }
};

var DISTRICTS = {
  "huangpu": {
    "name": "Huangpu",
    "cn": "黄浦区",
    "adcode": 310101,
    "color": "#e63946",
    "city": "shanghai",
    "blurb": "The historic core — the Bund, Nanjing Rd, Yu Garden, People's Square."
  },
  "pudong": {
    "name": "Pudong",
    "cn": "浦东新区",
    "adcode": 310115,
    "color": "#0096c7",
    "city": "shanghai",
    "blurb": "Futuristic Lujiazui skyline, riverside promenades, plus Disneyland out east."
  },
  "jingan": {
    "name": "Jing'an",
    "cn": "静安区",
    "adcode": 310106,
    "color": "#9b5de5",
    "city": "shanghai",
    "blurb": "Temples, upscale shopping, leafy streets and buzzy dining."
  },
  "xuhui": {
    "name": "Xuhui",
    "cn": "徐汇区",
    "adcode": 310104,
    "color": "#2a9d8f",
    "city": "shanghai",
    "blurb": "Former French Concession charm and the riverside West Bund art belt."
  },
  "changning": {
    "name": "Changning",
    "cn": "长宁区",
    "adcode": 310105,
    "color": "#f4a261",
    "city": "shanghai",
    "blurb": "Parks, the zoo, cafes and the Hongqiao gateway."
  },
  "hongkou": {
    "name": "Hongkou",
    "cn": "虹口区",
    "adcode": 310109,
    "color": "#e84393",
    "city": "shanghai",
    "blurb": "North Bund skyline views, literary Duolun Road, industrial heritage."
  },
  "yangpu": {
    "name": "Yangpu",
    "cn": "杨浦区",
    "adcode": 310110,
    "color": "#ff7d00",
    "city": "shanghai",
    "blurb": "Revived riverfront wharves, university district and design spaces."
  },
  "putuo": {
    "name": "Putuo",
    "cn": "普陀区",
    "adcode": 310107,
    "color": "#457b9d",
    "city": "shanghai",
    "blurb": "Suzhou Creek art warehouses (M50) and creative parks."
  },
  "minhang": {
    "name": "Minhang",
    "cn": "闵行区",
    "adcode": 310112,
    "color": "#c9184a",
    "city": "shanghai",
    "blurb": "Home to pretty Qibao old town and sprawling suburban life."
  },
  "baoshan": {
    "name": "Baoshan",
    "cn": "宝山区",
    "adcode": 310113,
    "color": "#06a77d",
    "city": "shanghai",
    "blurb": "Northern riverside where the Huangpu meets the Yangtze."
  },
  "jiading": {
    "name": "Jiading",
    "cn": "嘉定区",
    "adcode": 310114,
    "color": "#d90429",
    "city": "shanghai",
    "blurb": "Northwest town with a Confucius temple, gardens and the auto/F1 hub."
  },
  "qingpu": {
    "name": "Qingpu",
    "cn": "青浦区",
    "adcode": 310118,
    "color": "#3a86ff",
    "city": "shanghai",
    "blurb": "Zhujiajiao water town and Dianshan Lake, west of the city."
  },
  "songjiang": {
    "name": "Songjiang",
    "cn": "松江区",
    "adcode": 310117,
    "color": "#8338ec",
    "city": "shanghai",
    "blurb": "Sheshan hill, basilica and ancient relics in the southwest."
  },
  "jinshan": {
    "name": "Jinshan",
    "cn": "金山区",
    "adcode": 310116,
    "color": "#7209b7",
    "city": "shanghai",
    "blurb": "Far south coast with a beach and the Fengjing water town nearby."
  },
  "fengxian": {
    "name": "Fengxian",
    "cn": "奉贤区",
    "adcode": 310120,
    "color": "#f15bb5",
    "city": "shanghai",
    "blurb": "Southern coastal district with the Bihai Golden Beach."
  },
  "chongming": {
    "name": "Chongming",
    "cn": "崇明区",
    "adcode": 310151,
    "color": "#43aa8b",
    "city": "shanghai",
    "blurb": "Vast green island at the Yangtze mouth — wetlands and eco-parks."
  },
  "sz_huqiu_high_tech": {
    "name": "Huqiu / High-Tech",
    "cn": "虎丘区",
    "adcode": 320505,
    "color": "#c1121f",
    "city": "suzhou",
    "blurb": "Tiger Hill pagoda and the western high-tech zone."
  },
  "sz_wuzhong": {
    "name": "Wuzhong",
    "cn": "吴中区",
    "adcode": 320506,
    "color": "#e07a5f",
    "city": "suzhou",
    "blurb": "Lake Tai scenery and the Mudu garden-town side."
  },
  "sz_xiangcheng": {
    "name": "Xiangcheng",
    "cn": "相城区",
    "adcode": 320507,
    "color": "#bc6c25",
    "city": "suzhou",
    "blurb": "Northern district around Yangcheng Lake (hairy-crab country)."
  },
  "sz_gusu_old_town": {
    "name": "Gusu (Old Town)",
    "cn": "姑苏区",
    "adcode": 320508,
    "color": "#3d5a80",
    "city": "suzhou",
    "blurb": "Suzhou's UNESCO old town: classical gardens, Pingjiang Rd, canals and Suzhou Museum."
  },
  "sz_wujiang": {
    "name": "Wujiang",
    "cn": "吴江区",
    "adcode": 320509,
    "color": "#7d4f50",
    "city": "suzhou",
    "blurb": "Southern district; home to Tongli water town."
  },
  "sz_changshu": {
    "name": "Changshu",
    "cn": "常熟市",
    "adcode": 320581,
    "color": "#9b2226",
    "city": "suzhou",
    "blurb": "Lakeside city below Yushan hill."
  },
  "sz_zhangjiagang": {
    "name": "Zhangjiagang",
    "cn": "张家港市",
    "adcode": 320582,
    "color": "#5f797b",
    "city": "suzhou",
    "blurb": "Yangtze-side port city."
  },
  "sz_kunshan": {
    "name": "Kunshan",
    "cn": "昆山市",
    "adcode": 320583,
    "color": "#8a5a44",
    "city": "suzhou",
    "blurb": "Eastern city with the famous Zhouzhuang & Jinxi water towns."
  },
  "sz_taicang": {
    "name": "Taicang",
    "cn": "太仓市",
    "adcode": 320585,
    "color": "#606c38",
    "city": "suzhou",
    "blurb": "Coastal city near the Yangtze mouth."
  },
  "hz_shangcheng": {
    "name": "Shangcheng",
    "cn": "上城区",
    "adcode": 330102,
    "color": "#2a9d8f",
    "city": "hangzhou",
    "blurb": "Old downtown: Hefang St, Wushan hill and the Qiantang riverfront."
  },
  "hz_gongshu": {
    "name": "Gongshu",
    "cn": "拱墅区",
    "adcode": 330105,
    "color": "#43aa8b",
    "city": "hangzhou",
    "blurb": "Grand Canal district with the Qiaoxi historic block."
  },
  "hz_xihu_west_lake": {
    "name": "Xihu (West Lake)",
    "cn": "西湖区",
    "adcode": 330106,
    "color": "#4d908e",
    "city": "hangzhou",
    "blurb": "The West Lake, Lingyin Temple and the Longjing tea hills — Hangzhou's scenic heart."
  },
  "hz_binjiang": {
    "name": "Binjiang",
    "cn": "滨江区",
    "adcode": 330108,
    "color": "#577590",
    "city": "hangzhou",
    "blurb": "Riverside tech district across the Qiantang."
  },
  "hz_xiaoshan": {
    "name": "Xiaoshan",
    "cn": "萧山区",
    "adcode": 330109,
    "color": "#277da1",
    "city": "hangzhou",
    "blurb": "Airport district south of the river."
  },
  "hz_yuhang": {
    "name": "Yuhang",
    "cn": "余杭区",
    "adcode": 330110,
    "color": "#1b998b",
    "city": "hangzhou",
    "blurb": "Xixi Wetland and the Liangzhu archaeological site."
  },
  "hz_fuyang": {
    "name": "Fuyang",
    "cn": "富阳区",
    "adcode": 330111,
    "color": "#118ab2",
    "city": "hangzhou",
    "blurb": "Hilly southwest along the Fuchun River."
  },
  "hz_lin_an": {
    "name": "Lin'an",
    "cn": "临安区",
    "adcode": 330112,
    "color": "#06a77d",
    "city": "hangzhou",
    "blurb": "Forested western district; Taihu source."
  },
  "hz_linping": {
    "name": "Linping",
    "cn": "临平区",
    "adcode": 330113,
    "color": "#3a7ca5",
    "city": "hangzhou",
    "blurb": "Northeastern district."
  },
  "hz_qiantang": {
    "name": "Qiantang",
    "cn": "钱塘区",
    "adcode": 330114,
    "color": "#2d6a4f",
    "city": "hangzhou",
    "blurb": "Eastern new area along the Qiantang bore."
  },
  "hz_tonglu": {
    "name": "Tonglu",
    "cn": "桐庐县",
    "adcode": 330122,
    "color": "#40916c",
    "city": "hangzhou",
    "blurb": "Scenic Fuchun River gorges and caves."
  },
  "hz_chun_an": {
    "name": "Chun'an",
    "cn": "淳安县",
    "adcode": 330127,
    "color": "#52b788",
    "city": "hangzhou",
    "blurb": "Qiandao (Thousand Island) Lake."
  },
  "hz_jiande": {
    "name": "Jiande",
    "cn": "建德市",
    "adcode": 330182,
    "color": "#4361ee",
    "city": "hangzhou",
    "blurb": "Xin'an River valley and Meicheng old town."
  }
};
