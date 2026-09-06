// Presentation config — labels, colours and fallback imagery.
// Deliberately NOT in the database: these are UI decisions, not trip data.
const CATEGORIES = {
  sight:     { label: "Sights",    color: "#e63946" },
  food:      { label: "Food",      color: "#f4a261" },
  coffee:    { label: "Coffee",    color: "#6f4e37" },
  matcha:    { label: "Matcha",    color: "#7cb342" },
  culture:   { label: "Culture",   color: "#9b5de5" },
  shopping:  { label: "Shopping",  color: "#0096c7" },
  nature:    { label: "Nature",    color: "#2a9d8f" },
  nightlife: { label: "Nightlife", color: "#e84393" },
  lodging:   { label: "Hotels",    color: "#5c7cfa" },
  custom:    { label: "My pins",   color: "#6c757d" },
};

// Generic stand-in when a place has no image of its own.
var IMG_CAT = {
  sight:     "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/The_Bund_2.jpg/400px-The_Bund_2.jpg",
  food:      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Xiaolongbao-shanghai.jpg/400px-Xiaolongbao-shanghai.jpg",
  coffee:    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/A_small_cup_of_coffee.JPG/400px-A_small_cup_of_coffee.JPG",
  matcha:    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Matcha_bowl_and_whisk.jpg/400px-Matcha_bowl_and_whisk.jpg",
  culture:   "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Shanghai_Museum_2016.jpg/400px-Shanghai_Museum_2016.jpg",
  shopping:  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/East_Nanjing_Road_2020_%2850361842166%29.jpg/400px-East_Nanjing_Road_2020_%2850361842166%29.jpg",
  nature:    "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/West_Lake_Hangzhou.jpg/400px-West_Lake_Hangzhou.jpg",
  nightlife: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Xintiandi_Shanghai.jpg/400px-Xintiandi_Shanghai.jpg",
  lodging:   "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/The_Bund_2.jpg/400px-The_Bund_2.jpg",
  custom:    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/The_Bund_2.jpg/400px-The_Bund_2.jpg",
};
