import type { BusStand, Province } from '../types/location';

export const SRI_LANKA_PROVINCES: Province[] = [
  {
    name: "Western Province",
    districts: ["Colombo", "Gampaha", "Kalutara"]
  },
  {
    name: "Central Province",
    districts: ["Kandy", "Matale", "Nuwara Eliya"]
  },
  {
    name: "Southern Province",
    districts: ["Galle", "Matara", "Hambantota"]
  },
  {
    name: "North Western Province",
    districts: ["Kurunegala", "Puttalam"]
  },
  {
    name: "North Central Province",
    districts: ["Anuradhapura", "Polonnaruwa"]
  },
  {
    name: "Eastern Province",
    districts: ["Batticaloa", "Ampara", "Trincomalee"]
  },
  {
    name: "Northern Province",
    districts: ["Jaffna", "Kilinochchi", "Mannar", "Vavuniya", "Mullaitivu"]
  },
  {
    name: "Uva Province",
    districts: ["Badulla", "Monaragala"]
  },
  {
    name: "Sabaragamuwa Province",
    districts: ["Ratnapura", "Kegalle"]
  }
];

export const SRI_LANKA_BUS_STANDS: BusStand[] = [
  // ==========================================
  // WESTERN PROVINCE
  // ==========================================
  // Colombo District
  {
    id: "colombo-bastian-mawatha",
    name: "Colombo (Bastian Mawatha)",
    town: "Colombo",
    district: "Colombo",
    province: "Western Province",
    aliases: ["Bastian Mawatha", "Pettah", "Gunasinghapura", "Colombo Fort", "Central Bus Stand"],
    isMajorHub: true
  },
  {
    id: "makumbura-mmmc",
    name: "Makumbura (MMMC)",
    town: "Makumbura",
    district: "Colombo",
    province: "Western Province",
    aliases: ["MMMC", "Makumbura Multimodal", "Kottawa Expressway", "Kottawa MMMC"],
    isMajorHub: true
  },
  { id: "colombo-maharagama", name: "Maharagama", town: "Maharagama", district: "Colombo", province: "Western Province" },
  { id: "colombo-moratuwa", name: "Moratuwa", town: "Moratuwa", district: "Colombo", province: "Western Province" },
  { id: "colombo-piliyandala", name: "Piliyandala", town: "Piliyandala", district: "Colombo", province: "Western Province" },
  { id: "colombo-nugegoda", name: "Nugegoda", town: "Nugegoda", district: "Colombo", province: "Western Province" },
  { id: "colombo-homagama", name: "Homagama", town: "Homagama", district: "Colombo", province: "Western Province" },
  { id: "colombo-avissawella", name: "Avissawella", town: "Avissawella", district: "Colombo", province: "Western Province" },
  { id: "colombo-mount-lavinia", name: "Mount Lavinia", town: "Mount Lavinia", district: "Colombo", province: "Western Province" },
  { id: "colombo-dehiwala", name: "Dehiwala", town: "Dehiwala", district: "Colombo", province: "Western Province" },
  { id: "colombo-kaduwela", name: "Kaduwela", town: "Kaduwela", district: "Colombo", province: "Western Province" },
  { id: "colombo-kottawa", name: "Kottawa", town: "Kottawa", district: "Colombo", province: "Western Province" },

  // Gampaha District
  { id: "gampaha-gampaha", name: "Gampaha", town: "Gampaha", district: "Gampaha", province: "Western Province", isMajorHub: true },
  { id: "gampaha-negombo", name: "Negombo", town: "Negombo", district: "Gampaha", province: "Western Province", isMajorHub: true },
  { id: "gampaha-peliyagoda", name: "Peliyagoda", town: "Peliyagoda", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-kadawatha", name: "Kadawatha", town: "Kadawatha", district: "Gampaha", province: "Western Province", aliases: ["Kadawatha Expressway Interchange"], isMajorHub: true },
  { id: "gampaha-nittambuwa", name: "Nittambuwa", town: "Nittambuwa", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-veyangoda", name: "Veyangoda", town: "Veyangoda", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-minuwangoda", name: "Minuwangoda", town: "Minuwangoda", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-ja-ela", name: "Ja-Ela", town: "Ja-Ela", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-wattala", name: "Wattala", town: "Wattala", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-kelaniya", name: "Kelaniya", town: "Kelaniya", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-kiribathgoda", name: "Kiribathgoda", town: "Kiribathgoda", district: "Gampaha", province: "Western Province" },
  { id: "gampaha-yakkala", name: "Yakkala", town: "Yakkala", district: "Gampaha", province: "Western Province" },

  // Kalutara District
  { id: "kalutara-kalutara", name: "Kalutara", town: "Kalutara", district: "Kalutara", province: "Western Province", isMajorHub: true },
  { id: "kalutara-panadura", name: "Panadura", town: "Panadura", district: "Kalutara", province: "Western Province", isMajorHub: true },
  { id: "kalutara-horana", name: "Horana", town: "Horana", district: "Kalutara", province: "Western Province" },
  { id: "kalutara-mathugama", name: "Mathugama", town: "Mathugama", district: "Kalutara", province: "Western Province" },
  { id: "kalutara-aluthgama", name: "Aluthgama", town: "Aluthgama", district: "Kalutara", province: "Western Province" },
  { id: "kalutara-beruwala", name: "Beruwala", town: "Beruwala", district: "Kalutara", province: "Western Province" },
  { id: "kalutara-bandaragama", name: "Bandaragama", town: "Bandaragama", district: "Kalutara", province: "Western Province" },
  { id: "kalutara-wadduwa", name: "Wadduwa", town: "Wadduwa", district: "Kalutara", province: "Western Province" },
  { id: "kalutara-agalawatta", name: "Agalawatta", town: "Agalawatta", district: "Kalutara", province: "Western Province" },

  // ==========================================
  // CENTRAL PROVINCE
  // ==========================================
  // Kandy District
  {
    id: "kandy-goodshed",
    name: "Kandy (Goodshed)",
    town: "Kandy",
    district: "Kandy",
    province: "Central Province",
    aliases: ["Goodshed", "Kandy Central", "Kandy Town Bus Stand"],
    isMajorHub: true
  },
  { id: "kandy-peradeniya", name: "Peradeniya", town: "Peradeniya", district: "Kandy", province: "Central Province" },
  { id: "kandy-gampola", name: "Gampola", town: "Gampola", district: "Kandy", province: "Central Province" },
  { id: "kandy-nawalapitiya", name: "Nawalapitiya", town: "Nawalapitiya", district: "Kandy", province: "Central Province" },
  { id: "kandy-kadugannawa", name: "Kadugannawa", town: "Kadugannawa", district: "Kandy", province: "Central Province" },
  { id: "kandy-wattegama", name: "Wattegama", town: "Wattegama", district: "Kandy", province: "Central Province" },
  { id: "kandy-teldeniya", name: "Teldeniya", town: "Teldeniya", district: "Kandy", province: "Central Province" },
  { id: "kandy-katugastota", name: "Katugastota", town: "Katugastota", district: "Kandy", province: "Central Province" },
  { id: "kandy-pilimathalawa", name: "Pilimathalawa", town: "Pilimathalawa", district: "Kandy", province: "Central Province" },

  // Matale District
  { id: "matale-matale", name: "Matale", town: "Matale", district: "Matale", province: "Central Province", isMajorHub: true },
  { id: "matale-dambulla", name: "Dambulla", town: "Dambulla", district: "Matale", province: "Central Province", aliases: ["Dambulla Clock Tower", "Dambulla Hub"], isMajorHub: true },
  { id: "matale-galewela", name: "Galewela", town: "Galewela", district: "Matale", province: "Central Province" },
  { id: "matale-rattota", name: "Rattota", town: "Rattota", district: "Matale", province: "Central Province" },
  { id: "matale-ukuwela", name: "Ukuwela", town: "Ukuwela", district: "Matale", province: "Central Province" },
  { id: "matale-sigiriya", name: "Sigiriya", town: "Sigiriya", district: "Matale", province: "Central Province" },

  // Nuwara Eliya District
  { id: "nuwara-eliya-nuwara-eliya", name: "Nuwara Eliya", town: "Nuwara Eliya", district: "Nuwara Eliya", province: "Central Province", isMajorHub: true },
  { id: "nuwara-eliya-hatton", name: "Hatton", town: "Hatton", district: "Nuwara Eliya", province: "Central Province", isMajorHub: true },
  { id: "nuwara-eliya-thalawakele", name: "Thalawakele", town: "Thalawakele", district: "Nuwara Eliya", province: "Central Province" },
  { id: "nuwara-eliya-nanu-oya", name: "Nanu Oya", town: "Nanu Oya", district: "Nuwara Eliya", province: "Central Province" },
  { id: "nuwara-eliya-ginigathhena", name: "Ginigathhena", town: "Ginigathhena", district: "Nuwara Eliya", province: "Central Province" },
  { id: "nuwara-eliya-ragala", name: "Ragala", town: "Ragala", district: "Nuwara Eliya", province: "Central Province" },
  { id: "nuwara-eliya-maskeliya", name: "Maskeliya", town: "Maskeliya", district: "Nuwara Eliya", province: "Central Province" },
  { id: "nuwara-eliya-bogawantalawa", name: "Bogawantalawa", town: "Bogawantalawa", district: "Nuwara Eliya", province: "Central Province" },

  // ==========================================
  // SOUTHERN PROVINCE
  // ==========================================
  // Galle District
  { id: "galle-galle", name: "Galle", town: "Galle", district: "Galle", province: "Southern Province", aliases: ["Galle Central Bus Stand"], isMajorHub: true },
  { id: "galle-ambalangoda", name: "Ambalangoda", town: "Ambalangoda", district: "Galle", province: "Southern Province" },
  { id: "galle-elpitiya", name: "Elpitiya", town: "Elpitiya", district: "Galle", province: "Southern Province" },
  { id: "galle-hikkaduwa", name: "Hikkaduwa", town: "Hikkaduwa", district: "Galle", province: "Southern Province" },
  { id: "galle-karapitiya", name: "Karapitiya", town: "Karapitiya", district: "Galle", province: "Southern Province" },
  { id: "galle-baddegama", name: "Baddegama", town: "Baddegama", district: "Galle", province: "Southern Province" },
  { id: "galle-udugama", name: "Udugama", town: "Udugama", district: "Galle", province: "Southern Province" },
  { id: "galle-neluwa", name: "Neluwa", town: "Neluwa", district: "Galle", province: "Southern Province" },

  // Matara District
  { id: "matara-matara", name: "Matara", town: "Matara", district: "Matara", province: "Southern Province", aliases: ["Matara Central Bus Stand"], isMajorHub: true },
  { id: "matara-weligama", name: "Weligama", town: "Weligama", district: "Matara", province: "Southern Province" },
  { id: "matara-akuressa", name: "Akuressa", town: "Akuressa", district: "Matara", province: "Southern Province" },
  { id: "matara-kamburupitiya", name: "Kamburupitiya", town: "Kamburupitiya", district: "Matara", province: "Southern Province" },
  { id: "matara-deniyaya", name: "Deniyaya", town: "Deniyaya", district: "Matara", province: "Southern Province" },
  { id: "matara-hakmana", name: "Hakmana", town: "Hakmana", district: "Matara", province: "Southern Province" },
  { id: "matara-morawaka", name: "Morawaka", town: "Morawaka", district: "Matara", province: "Southern Province" },

  // Hambantota District
  { id: "hambantota-hambantota", name: "Hambantota", town: "Hambantota", district: "Hambantota", province: "Southern Province", isMajorHub: true },
  { id: "hambantota-tangalle", name: "Tangalle", town: "Tangalle", district: "Hambantota", province: "Southern Province", isMajorHub: true },
  { id: "hambantota-ambalantota", name: "Ambalantota", town: "Ambalantota", district: "Hambantota", province: "Southern Province" },
  { id: "hambantota-beliatta", name: "Beliatta", town: "Beliatta", district: "Hambantota", province: "Southern Province" },
  { id: "hambantota-tissamaharama", name: "Tissamaharama", town: "Tissamaharama", district: "Hambantota", province: "Southern Province", aliases: ["Tissa"] },
  { id: "hambantota-walasmulla", name: "Walasmulla", town: "Walasmulla", district: "Hambantota", province: "Southern Province" },
  { id: "hambantota-suriyawewa", name: "Suriyawewa", town: "Suriyawewa", district: "Hambantota", province: "Southern Province" },

  // ==========================================
  // NORTH WESTERN PROVINCE
  // ==========================================
  // Kurunegala District
  { id: "kurunegala-kurunegala", name: "Kurunegala", town: "Kurunegala", district: "Kurunegala", province: "North Western Province", aliases: ["Kurunegala Central Bus Stand"], isMajorHub: true },
  { id: "kurunegala-kuliyapitiya", name: "Kuliyapitiya", town: "Kuliyapitiya", district: "Kurunegala", province: "North Western Province", isMajorHub: true },
  { id: "kurunegala-narammala", name: "Narammala", town: "Narammala", district: "Kurunegala", province: "North Western Province" },
  { id: "kurunegala-wariyapola", name: "Wariyapola", town: "Wariyapola", district: "Kurunegala", province: "North Western Province" },
  { id: "kurunegala-maho", name: "Maho", town: "Maho", district: "Kurunegala", province: "North Western Province" },
  { id: "kurunegala-polgahawela", name: "Polgahawela", town: "Polgahawela", district: "Kurunegala", province: "North Western Province" },
  { id: "kurunegala-pannala", name: "Pannala", town: "Pannala", district: "Kurunegala", province: "North Western Province" },
  { id: "kurunegala-giriulla", name: "Giriulla", town: "Giriulla", district: "Kurunegala", province: "North Western Province" },
  { id: "kurunegala-mawathagama", name: "Mawathagama", town: "Mawathagama", district: "Kurunegala", province: "North Western Province" },
  { id: "kurunegala-ibbagamuwa", name: "Ibbagamuwa", town: "Ibbagamuwa", district: "Kurunegala", province: "North Western Province" },

  // Puttalam District
  { id: "puttalam-puttalam", name: "Puttalam", town: "Puttalam", district: "Puttalam", province: "North Western Province", isMajorHub: true },
  { id: "puttalam-chilaw", name: "Chilaw", town: "Chilaw", district: "Puttalam", province: "North Western Province", isMajorHub: true },
  { id: "puttalam-wennappuwa", name: "Wennappuwa", town: "Wennappuwa", district: "Puttalam", province: "North Western Province" },
  { id: "puttalam-anamaduwa", name: "Anamaduwa", town: "Anamaduwa", district: "Puttalam", province: "North Western Province" },
  { id: "puttalam-nattandiya", name: "Nattandiya", town: "Nattandiya", district: "Puttalam", province: "North Western Province" },
  { id: "puttalam-kalpitiya", name: "Kalpitiya", town: "Kalpitiya", district: "Puttalam", province: "North Western Province" },
  { id: "puttalam-marawila", name: "Marawila", town: "Marawila", district: "Puttalam", province: "North Western Province" },
  { id: "puttalam-dankotuwa", name: "Dankotuwa", town: "Dankotuwa", district: "Puttalam", province: "North Western Province" },

  // ==========================================
  // NORTH CENTRAL PROVINCE
  // ==========================================
  // Anuradhapura District
  { id: "anuradhapura-anuradhapura", name: "Anuradhapura", town: "Anuradhapura", district: "Anuradhapura", province: "North Central Province", aliases: ["Anuradhapura New Town", "Anuradhapura Old Bus Stand"], isMajorHub: true },
  { id: "anuradhapura-kekirawa", name: "Kekirawa", town: "Kekirawa", district: "Anuradhapura", province: "North Central Province" },
  { id: "anuradhapura-medawachchiya", name: "Medawachchiya", town: "Medawachchiya", district: "Anuradhapura", province: "North Central Province", aliases: ["Medawachchiya Junction"], isMajorHub: true },
  { id: "anuradhapura-tambuttegama", name: "Tambuttegama", town: "Tambuttegama", district: "Anuradhapura", province: "North Central Province" },
  { id: "anuradhapura-eppawala", name: "Eppawala", town: "Eppawala", district: "Anuradhapura", province: "North Central Province" },
  { id: "anuradhapura-padaviya", name: "Padaviya", town: "Padaviya", district: "Anuradhapura", province: "North Central Province" },
  { id: "anuradhapura-galenbindunuwewa", name: "Galenbindunuwewa", town: "Galenbindunuwewa", district: "Anuradhapura", province: "North Central Province" },
  { id: "anuradhapura-nochchiyagama", name: "Nochchiyagama", town: "Nochchiyagama", district: "Anuradhapura", province: "North Central Province" },

  // Polonnaruwa District
  {
    id: "polonnaruwa-kaduruwela",
    name: "Polonnaruwa (Kaduruwela)",
    town: "Polonnaruwa",
    district: "Polonnaruwa",
    province: "North Central Province",
    aliases: ["Kaduruwela", "Polonnaruwa Town", "Kaduruwela Bus Stand"],
    isMajorHub: true
  },
  { id: "polonnaruwa-hingurakgoda", name: "Hingurakgoda", town: "Hingurakgoda", district: "Polonnaruwa", province: "North Central Province" },
  { id: "polonnaruwa-medirigiriya", name: "Medirigiriya", town: "Medirigiriya", district: "Polonnaruwa", province: "North Central Province" },
  { id: "polonnaruwa-welikanda", name: "Welikanda", town: "Welikanda", district: "Polonnaruwa", province: "North Central Province" },
  { id: "polonnaruwa-aralaganwila", name: "Aralaganwila", town: "Aralaganwila", district: "Polonnaruwa", province: "North Central Province" },

  // ==========================================
  // EASTERN PROVINCE
  // ==========================================
  // Batticaloa District
  { id: "batticaloa-batticaloa", name: "Batticaloa", town: "Batticaloa", district: "Batticaloa", province: "Eastern Province", aliases: ["Batticaloa Bus Stand"], isMajorHub: true },
  { id: "batticaloa-kattankudy", name: "Kattankudy", town: "Kattankudy", district: "Batticaloa", province: "Eastern Province", aliases: ["Kattankudi"], isMajorHub: true },
  { id: "batticaloa-eravur", name: "Eravur", town: "Eravur", district: "Batticaloa", province: "Eastern Province" },
  { id: "batticaloa-valaichchenai", name: "Valaichchenai", town: "Valaichchenai", district: "Batticaloa", province: "Eastern Province", aliases: ["Valachchenai"], isMajorHub: true },
  { id: "batticaloa-kalkudah", name: "Kalkudah", town: "Kalkudah", district: "Batticaloa", province: "Eastern Province" },
  { id: "batticaloa-kaluwanchikudy", name: "Kaluwanchikudy", town: "Kaluwanchikudy", district: "Batticaloa", province: "Eastern Province" },
  { id: "batticaloa-chenkalady", name: "Chenkalady", town: "Chenkalady", district: "Batticaloa", province: "Eastern Province" },
  { id: "batticaloa-oddamavadi", name: "Oddamavadi", town: "Oddamavadi", district: "Batticaloa", province: "Eastern Province" },

  // Ampara District
  { id: "ampara-ampara", name: "Ampara", town: "Ampara", district: "Ampara", province: "Eastern Province", isMajorHub: true },
  { id: "ampara-kalmunai", name: "Kalmunai", town: "Kalmunai", district: "Ampara", province: "Eastern Province", aliases: ["Kalmunai Bus Stand"], isMajorHub: true },
  { id: "ampara-akkaraipattu", name: "Akkaraipattu", town: "Akkaraipattu", district: "Ampara", province: "Eastern Province", isMajorHub: true },
  { id: "ampara-sammanthurai", name: "Sammanthurai", town: "Sammanthurai", district: "Ampara", province: "Eastern Province" },
  { id: "ampara-pottuvil", name: "Pottuvil", town: "Pottuvil", district: "Ampara", province: "Eastern Province", aliases: ["Arugam Bay Junction"] },
  { id: "ampara-dehiattakandiya", name: "Dehiattakandiya", town: "Dehiattakandiya", district: "Ampara", province: "Eastern Province" },
  { id: "ampara-maha-oya", name: "Maha Oya", town: "Maha Oya", district: "Ampara", province: "Eastern Province" },
  { id: "ampara-nintavur", name: "Nintavur", town: "Nintavur", district: "Ampara", province: "Eastern Province" },
  { id: "ampara-thirukkondaiyadu", name: "Thirukkondaiyadu", town: "Thirukkondaiyadu", district: "Ampara", province: "Eastern Province" },

  // Trincomalee District
  { id: "trincomalee-trincomalee", name: "Trincomalee", town: "Trincomalee", district: "Trincomalee", province: "Eastern Province", aliases: ["Trincomalee Central Bus Stand"], isMajorHub: true },
  { id: "trincomalee-kantalai", name: "Kantalai", town: "Kantalai", district: "Trincomalee", province: "Eastern Province", isMajorHub: true },
  { id: "trincomalee-kinniya", name: "Kinniya", town: "Kinniya", district: "Trincomalee", province: "Eastern Province" },
  { id: "trincomalee-mutur", name: "Mutur", town: "Mutur", district: "Trincomalee", province: "Eastern Province" },
  { id: "trincomalee-pulmoddai", name: "Pulmoddai", town: "Pulmoddai", district: "Trincomalee", province: "Eastern Province" },
  { id: "trincomalee-serunuwara", name: "Serunuwara", town: "Serunuwara", district: "Trincomalee", province: "Eastern Province" },

  // ==========================================
  // NORTHERN PROVINCE
  // ==========================================
  // Jaffna District
  { id: "jaffna-jaffna", name: "Jaffna", town: "Jaffna", district: "Jaffna", province: "Northern Province", aliases: ["Jaffna Central Bus Stand", "Jaffna Town"], isMajorHub: true },
  { id: "jaffna-point-pedro", name: "Point Pedro", town: "Point Pedro", district: "Jaffna", province: "Northern Province", aliases: ["Paruthithurai"], isMajorHub: true },
  { id: "jaffna-chavakachcheri", name: "Chavakachcheri", town: "Chavakachcheri", district: "Jaffna", province: "Northern Province" },
  { id: "jaffna-nallur", name: "Nallur", town: "Nallur", district: "Jaffna", province: "Northern Province" },
  { id: "jaffna-kks", name: "Kankesanthurai (KKS)", town: "Kankesanthurai", district: "Jaffna", province: "Northern Province", aliases: ["KKS", "Kankesanthurai"] },
  { id: "jaffna-chunnakam", name: "Chunnakam", town: "Chunnakam", district: "Jaffna", province: "Northern Province" },
  { id: "jaffna-valvettithurai", name: "Valvettithurai", town: "Valvettithurai", district: "Jaffna", province: "Northern Province", aliases: ["VVT"] },
  { id: "jaffna-kayts", name: "Kayts", town: "Kayts", district: "Jaffna", province: "Northern Province" },

  // Kilinochchi District
  { id: "kilinochchi-kilinochchi", name: "Kilinochchi", town: "Kilinochchi", district: "Kilinochchi", province: "Northern Province", aliases: ["Kilinochchi Central Bus Stand"], isMajorHub: true },
  { id: "kilinochchi-pallai", name: "Pallai", town: "Pallai", district: "Kilinochchi", province: "Northern Province" },
  { id: "kilinochchi-pooneryn", name: "Pooneryn", town: "Pooneryn", district: "Kilinochchi", province: "Northern Province", aliases: ["Poonagari"] },
  { id: "kilinochchi-paranthan", name: "Paranthan", town: "Paranthan", district: "Kilinochchi", province: "Northern Province", aliases: ["Paranthan Junction"] },

  // Mannar District
  { id: "mannar-mannar", name: "Mannar", town: "Mannar", district: "Mannar", province: "Northern Province", aliases: ["Mannar Bus Stand"], isMajorHub: true },
  { id: "mannar-murunkan", name: "Murunkan", town: "Murunkan", district: "Mannar", province: "Northern Province" },
  { id: "mannar-pesalai", name: "Pesalai", town: "Pesalai", district: "Mannar", province: "Northern Province" },
  { id: "mannar-nanattan", name: "Nanattan", town: "Nanattan", district: "Mannar", province: "Northern Province" },

  // Vavuniya District
  { id: "vavuniya-vavuniya", name: "Vavuniya", town: "Vavuniya", district: "Vavuniya", province: "Northern Province", aliases: ["Vavuniya Central Bus Stand"], isMajorHub: true },
  { id: "vavuniya-cheddikulam", name: "Cheddikulam", town: "Cheddikulam", district: "Vavuniya", province: "Northern Province" },
  { id: "vavuniya-nedunkeni", name: "Nedunkeni", town: "Nedunkeni", district: "Vavuniya", province: "Northern Province" },

  // Mullaitivu District
  { id: "mullaitivu-mullaitivu", name: "Mullaitivu", town: "Mullaitivu", district: "Mullaitivu", province: "Northern Province", isMajorHub: true },
  { id: "mullaitivu-puthukkudiyiruppu", name: "Puthukkudiyiruppu", town: "Puthukkudiyiruppu", district: "Mullaitivu", province: "Northern Province", aliases: ["PTK"] },
  { id: "mullaitivu-mankulam", name: "Mankulam", town: "Mankulam", district: "Mullaitivu", province: "Northern Province", aliases: ["Mankulam Junction on A9"], isMajorHub: true },
  { id: "mullaitivu-mallavi", name: "Mallavi", town: "Mallavi", district: "Mullaitivu", province: "Northern Province" },
  { id: "mullaitivu-welioya", name: "Welioya", town: "Welioya", district: "Mullaitivu", province: "Northern Province" },

  // ==========================================
  // UVA PROVINCE
  // ==========================================
  // Badulla District
  { id: "badulla-badulla", name: "Badulla", town: "Badulla", district: "Badulla", province: "Uva Province", aliases: ["Badulla Central Bus Stand"], isMajorHub: true },
  { id: "badulla-bandarawela", name: "Bandarawela", town: "Bandarawela", district: "Badulla", province: "Uva Province", isMajorHub: true },
  { id: "badulla-welimada", name: "Welimada", town: "Welimada", district: "Badulla", province: "Uva Province" },
  { id: "badulla-mahiyanganaya", name: "Mahiyanganaya", town: "Mahiyanganaya", district: "Badulla", province: "Uva Province", isMajorHub: true },
  { id: "badulla-haputale", name: "Haputale", town: "Haputale", district: "Badulla", province: "Uva Province" },
  { id: "badulla-passara", name: "Passara", town: "Passara", district: "Badulla", province: "Uva Province" },
  { id: "badulla-hali-ela", name: "Hali Ela", town: "Hali Ela", district: "Badulla", province: "Uva Province" },
  { id: "badulla-diyatalawa", name: "Diyatalawa", town: "Diyatalawa", district: "Badulla", province: "Uva Province" },

  // Monaragala District
  { id: "monaragala-monaragala", name: "Monaragala", town: "Monaragala", district: "Monaragala", province: "Uva Province", isMajorHub: true },
  { id: "monaragala-wellawaya", name: "Wellawaya", town: "Wellawaya", district: "Monaragala", province: "Uva Province", aliases: ["Wellawaya Hub"], isMajorHub: true },
  { id: "monaragala-bibile", name: "Bibile", town: "Bibile", district: "Monaragala", province: "Uva Province" },
  { id: "monaragala-kataragama", name: "Kataragama", town: "Kataragama", district: "Monaragala", province: "Uva Province", aliases: ["Kataragama Sacred City Terminal"], isMajorHub: true },
  { id: "monaragala-buttala", name: "Buttala", town: "Buttala", district: "Monaragala", province: "Uva Province" },
  { id: "monaragala-medagama", name: "Medagama", town: "Medagama", district: "Monaragala", province: "Uva Province" },
  { id: "monaragala-siyambalanduwa", name: "Siyambalanduwa", town: "Siyambalanduwa", district: "Monaragala", province: "Uva Province" },

  // ==========================================
  // SABARAGAMUWA PROVINCE
  // ==========================================
  // Ratnapura District
  { id: "ratnapura-ratnapura", name: "Ratnapura", town: "Ratnapura", district: "Ratnapura", province: "Sabaragamuwa Province", aliases: ["Ratnapura Central Bus Stand"], isMajorHub: true },
  { id: "ratnapura-embilipitiya", name: "Embilipitiya", town: "Embilipitiya", district: "Ratnapura", province: "Sabaragamuwa Province", isMajorHub: true },
  { id: "ratnapura-balangoda", name: "Balangoda", town: "Balangoda", district: "Ratnapura", province: "Sabaragamuwa Province" },
  { id: "ratnapura-pelmadulla", name: "Pelmadulla", town: "Pelmadulla", district: "Ratnapura", province: "Sabaragamuwa Province" },
  { id: "ratnapura-kahawatta", name: "Kahawatta", town: "Kahawatta", district: "Ratnapura", province: "Sabaragamuwa Province" },
  { id: "ratnapura-rakwana", name: "Rakwana", town: "Rakwana", district: "Ratnapura", province: "Sabaragamuwa Province" },
  { id: "ratnapura-kuruwita", name: "Kuruwita", town: "Kuruwita", district: "Ratnapura", province: "Sabaragamuwa Province" },
  { id: "ratnapura-godakawela", name: "Godakawela", town: "Godakawela", district: "Ratnapura", province: "Sabaragamuwa Province" },

  // Kegalle District
  { id: "kegalle-kegalle", name: "Kegalle", town: "Kegalle", district: "Kegalle", province: "Sabaragamuwa Province", aliases: ["Kegalle Bus Stand"], isMajorHub: true },
  { id: "kegalle-mawanella", name: "Mawanella", town: "Mawanella", district: "Kegalle", province: "Sabaragamuwa Province" },
  { id: "kegalle-warakapola", name: "Warakapola", town: "Warakapola", district: "Kegalle", province: "Sabaragamuwa Province" },
  { id: "kegalle-ruwanwella", name: "Ruwanwella", town: "Ruwanwella", district: "Kegalle", province: "Sabaragamuwa Province" },
  { id: "kegalle-yatiyantota", name: "Yatiyantota", town: "Yatiyantota", district: "Kegalle", province: "Sabaragamuwa Province" },
  { id: "kegalle-rambukkana", name: "Rambukkana", town: "Rambukkana", district: "Kegalle", province: "Sabaragamuwa Province" },
  { id: "kegalle-deraniyagala", name: "Deraniyagala", town: "Deraniyagala", district: "Kegalle", province: "Sabaragamuwa Province" },
  { id: "kegalle-galigamuwa", name: "Galigamuwa", town: "Galigamuwa", district: "Kegalle", province: "Sabaragamuwa Province" }
];

/**
 * Unique list of all distinct town names across all 25 districts
 */
export const SRI_LANKA_TOWNS: string[] = Array.from(
  new Set(SRI_LANKA_BUS_STANDS.map(s => s.town))
).sort((a, b) => a.localeCompare(b));

/**
 * Top major transport terminals & intermodal interchanges in Sri Lanka
 */
export const MAJOR_TRANSPORT_HUBS: BusStand[] = SRI_LANKA_BUS_STANDS.filter(s => s.isMajorHub);

/**
 * Intelligent location search:
 * Matches query against town, bus stand name, district, province, or aliases.
 * Results prioritized:
 * 1. Exact town or name match
 * 2. Major transit hub match
 * 3. District / alias substring match
 */
export function searchBusStands(query: string, limit = 15): BusStand[] {
  if (!query || !query.trim()) {
    // Return curated major hubs if no query provided
    return MAJOR_TRANSPORT_HUBS.slice(0, limit);
  }

  const q = query.trim().toLowerCase();

  const scored = SRI_LANKA_BUS_STANDS.map(stand => {
    let score = 0;
    const nameLower = stand.name.toLowerCase();
    const townLower = stand.town.toLowerCase();
    const districtLower = stand.district.toLowerCase();
    const provinceLower = stand.province.toLowerCase();

    if (townLower === q || nameLower === q) score += 100;
    else if (townLower.startsWith(q) || nameLower.startsWith(q)) score += 60;
    else if (nameLower.includes(q) || townLower.includes(q)) score += 40;

    // Check aliases
    if (stand.aliases) {
      for (const alias of stand.aliases) {
        const aLower = alias.toLowerCase();
        if (aLower === q) score += 80;
        else if (aLower.startsWith(q)) score += 50;
        else if (aLower.includes(q)) score += 30;
      }
    }

    if (districtLower.startsWith(q)) score += 25;
    else if (districtLower.includes(q)) score += 15;

    if (provinceLower.includes(q)) score += 10;

    // Boost major transport hubs
    if (stand.isMajorHub && score > 0) {
      score += 15;
    }

    return { stand, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.stand);
}

/**
 * Normalizes location strings for flexible route matching
 * e.g. "Colombo (Bastian Mawatha)" -> "colombo"
 *      "Kandy (Goodshed)" -> "kandy"
 *      "Makumbura (MMMC)" -> "makumbura"
 *      "Polonnaruwa (Kaduruwela)" -> "polonnaruwa"
 */
export function normalizeLocation(loc: string): string {
  if (!loc) return '';
  const cleaned = loc
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // remove parenthesized details like (Bastian Mawatha)
    .trim();
  return cleaned || loc.toLowerCase().trim();
}

/**
 * Checks if search location matches a trip stop (tolerant to terminal names, aliases, and parent cities)
 */
export function matchLocation(searchQuery: string, stopCity: string): boolean {
  if (!searchQuery || !stopCity) return false;
  const qNorm = normalizeLocation(searchQuery);
  const stopNorm = normalizeLocation(stopCity);

  if (qNorm === stopNorm) return true;
  if (stopNorm.includes(qNorm) || qNorm.includes(stopNorm)) return true;

  // Check against known bus stand aliases
  const matchedStand = SRI_LANKA_BUS_STANDS.find(
    s => s.name.toLowerCase() === stopCity.toLowerCase() || s.town.toLowerCase() === stopNorm
  );

  if (matchedStand?.aliases) {
    for (const alias of matchedStand.aliases) {
      const aNorm = normalizeLocation(alias);
      if (aNorm === qNorm || aNorm.includes(qNorm) || qNorm.includes(aNorm)) {
        return true;
      }
    }
  }

  return false;
}
