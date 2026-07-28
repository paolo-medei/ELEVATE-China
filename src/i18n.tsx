import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Bilingual } from './data/types';

export type Lang = 'en' | 'zh';
export type Theme = 'dark' | 'light';

const DICT = {
  appName: { en: 'PastureWatch', zh: '牧眼' },
  appTagline: {
    en: 'Drone herd intelligence & grassland balance',
    zh: '无人机牛群识别与草畜平衡监测',
  },
  demoBanner: {
    en: 'Demonstration dataset — simulated season',
    zh: '演示数据 · 模拟牧季',
  },

  // warning panel
  warnTitle: { en: '{n} things need your attention today', zh: '今日有 {n} 项需要处理' },
  warnMissing: { en: 'Cattle missing, by herd', zh: '各牛群缺失情况' },
  warnMissingN: { en: '{n} missing of {all}', zh: '{all} 头中缺 {n} 头' },
  warnAllPresent: { en: 'All {n} present', zh: '{n} 头全部在场' },
  warnSeparatedN: { en: '{n} temporarily apart', zh: '{n} 头暂时离群' },
  mapPlayHint: {
    en: 'Press play to watch the animals move through the day.',
    zh: '点击播放，观看牛群一天中的移动。',
  },
  warnUrgent: { en: 'Needs a person today', zh: '今日须派人查看' },
  warnNoUrgent: { en: 'No animal is isolated or lying still.', zh: '无离群或长时间静止的牛只。' },
  warnUrgentDetail: { en: '{m} m from the herd · still for {h} h', zh: '离群 {m} 米 · 静止 {h} 小时' },
  factDetected: { en: 'Cattle detected', zh: '识别头数' },
  factDetectedNote: { en: 'seen by the last flight', zh: '最近一次航拍所见' },
  needCheck: { en: 'To check', zh: '待查看' },
  herdLongGone: { en: 'Missing for days', zh: '多日未见' },
  mapAllSub: {
    en: 'Every animal is a dot, coloured by herd. Animals needing a person are circled and named.',
    zh: '每头牛为一个圆点，按牛群着色；需查看的牛只用圆圈标出并标注编号。',
  },
  turgenGorge: { en: 'Turgen Gorge', zh: '图尔根峡谷' },
  bartogai: { en: 'Bartogai Reservoir', zh: '巴尔托盖水库' },
  assyRiver: { en: 'Assy River', zh: '阿瑟河' },
  sevCritical: { en: 'Urgent', zh: '紧急' },
  sevSerious: { en: 'Important', zh: '重要' },
  sevWarning: { en: 'Keep an eye on', zh: '需留意' },
  alertWhat: { en: 'What the drone saw', zh: '航拍所见' },
  alertWhy: { en: 'Why it matters', zh: '为何重要' },
  alertAction: { en: 'What to do', zh: '建议措施' },
  histAttention: { en: 'Animals needing attention over time', zh: '需关注牛只的变化' },
  histAttentionSub: {
    en: 'The same rules as the dashboard, run across the whole season',
    zh: '与主页相同的规则，贯穿整个牧季',
  },
  histVsTwoWeeks: { en: '{now} today vs {then} two weeks ago', zh: '今日 {now} 头，两周前 {then} 头' },
  histGreenGrid: { en: 'Green Index by area, through the season', zh: '各草场植被指数变化' },
  histGreenGridSub: {
    en: 'Each column is fifteen days — click one to jump the dashboard to it',
    zh: '每列为 15 天，点击可跳转至该时段',
  },
  histMonths: { en: 'Month by month', zh: '各月汇总' },
  histMonth: { en: 'Month', zh: '月份' },
  histYears: { en: 'Season by season', zh: '各牧季汇总' },
  histYearsSub: {
    en: 'Earlier seasons come from the operation’s own records',
    zh: '往年数据来自牧场自有记录',
  },
  histSeason: { en: 'Season', zh: '牧季' },
  histLost: { en: 'Animals lost', zh: '走失头数' },
  histWalkedAvg: { en: 'Walked (daily avg)', zh: '日均行走' },

  // sections
  navToday: { en: 'Today', zh: '今日' },
  navMap: { en: 'Herd map', zh: '牛群地图' },
  navAlerts: { en: 'Alerts', zh: '预警' },
  navHistory: { en: 'History', zh: '历史记录' },
  navGrass: { en: 'Grass', zh: '牧草' },

  // herd map & individual animals
  mapHerdTitle: { en: 'Every animal on the ground', zh: '每头牛的位置' },
  mapHerdSub: {
    en: '{n} animals located by the last flight — click a dot for its record',
    zh: '最近一次航拍定位 {n} 头牛，点击圆点查看详情',
  },
  basemapSatellite: { en: 'Satellite', zh: '卫星图' },
  basemapPlain: { en: 'Plain', zh: '底图' },
  allHerds: { en: 'All herds', zh: '全部牛群' },
  confHigh: { en: 'Sure (95%+)', zh: '高置信 (95%+)' },
  confMid: { en: 'Fairly sure', zh: '较高' },
  confLow: { en: 'Unsure', zh: '偏低' },
  confNone: { en: 'Not found', zh: '未识别' },
  cowDetailTitle: { en: 'Animal record', zh: '个体档案' },
  cowDetailEmpty: {
    en: 'Click any animal on the map, or one of the flagged animals below.',
    zh: '点击地图上的任意圆点，或下方标记的牛只。',
  },
  cowSeen: { en: 'Last seen', zh: '最近一次看到' },
  cowSeenNow: { en: 'This flight', zh: '本次航拍' },
  cowSeenDaysAgo: { en: '{n} days ago', zh: '{n} 天前' },
  cowSeenYesterday: { en: 'Yesterday', zh: '昨天' },
  cowSeenLong: { en: 'Not seen for weeks', zh: '数周未见' },
  cowGps: { en: 'GPS', zh: 'GPS 坐标' },
  cowHeight: { en: 'Height', zh: '海拔' },
  cowWalked: { en: 'Walked today', zh: '今日行走' },
  cowStill: { en: 'Time standing still', zh: '静止时长' },
  cowFromHerd: { en: 'Distance from herd', zh: '离群距离' },
  flag_notFound: { en: 'Not found', zh: '未找到' },
  flag_isolated: { en: 'Away from the group', zh: '离群' },
  flag_stationary: { en: 'Not moving enough', zh: '活动过少' },
  flag_sick: { en: 'Possibly sick', zh: '疑似患病' },
  flag_separated: { en: 'Drifted from the group', zh: '暂时离群' },

  // alerts page
  alertsPageSub: { en: 'Every animal the system wants a person to look at', zh: '需人工复核的牛只' },
  alertsNone: { en: 'No animal needs attention today.', zh: '今日无需复核的牛只。' },
  alertsHerdTitle: { en: 'Whole-herd alerts', zh: '牛群级预警' },
  cowsFlagged: { en: '{n} animals flagged', zh: '{n} 头牛被标记' },

  // history page
  historyFlights: { en: 'Flights flown', zh: '已飞架次' },
  historyFlightsSub: { en: 'Two a day when the weather allows', zh: '天气允许时每日两架次' },
  historyCounts: { en: 'Cattle counted each day', zh: '每日清点头数' },
  historyCountsSub: { en: 'Against {n} on the books', zh: '在册共 {n} 头' },
  historyTable: { en: 'Recent flights', zh: '近期航拍' },
  historyWalk: { en: 'How far the herds walked', zh: '牛群行走距离' },
  historyWalkSub: { en: 'Kilometres per animal per day', zh: '每头每日公里数' },

  // grass page
  grassPageTitle: { en: 'Grass quality', zh: '牧草质量' },
  grassPageSub: {
    en: 'How green each area is, and how much of its grass has been eaten',
    zh: '各草场的植被状况与采食比例',
  },
  greenness: { en: 'Greenness', zh: '植被指数' },
  greennessSub: {
    en: 'Vegetation index from the drone camera: 0.8 is lush, 0.2 is bare',
    zh: '无人机影像植被指数：0.8 为茂盛，0.2 为裸露',
  },
  greennessTrend: { en: 'Greenness through the season', zh: '牧季植被指数变化' },
  grassStock: { en: 'Grass on the ground', zh: '现存牧草' },

  // today facts
  factCows: { en: 'Cattle on the farm', zh: '全场牛只' },
  factFlight: { en: 'Last drone flight', zh: '最近航拍' },
  factWalked: { en: 'Walked today', zh: '今日行走' },
  factGreen: { en: 'Grass greenness', zh: '牧草长势' },
  factGreenGood: { en: 'good', zh: '良好' },
  factGreenFair: { en: 'fair', zh: '一般' },
  factGreenPoor: { en: 'poor', zh: '较差' },
  factAreasOut: { en: '{n} areas out of grass', zh: '{n} 个草场牧草用尽' },
  herdStatus: { en: 'Herd status', zh: '牛群状态' },

  // the one screen
  bigAllSafe: { en: 'All cattle are safe', zh: '牛群全部安全' },
  bigMissing: { en: '{n} cattle missing from {herd}', zh: '{herd} 缺 {n} 头牛' },
  bigSeen: { en: 'The drone saw {seen} of {all} cattle', zh: '无人机看到 {seen} 头，共 {all} 头' },
  bigFlightShort: {
    en: 'The drone could not finish its round today',
    zh: '今日无人机未完成巡查',
  },
  bigCheckAgain: { en: 'Check again', zh: '需复查' },
  bigWhere: { en: 'Where the cattle are', zh: '牛群在哪里' },
  water: { en: 'Water', zh: '水点' },
  bigToDo: { en: 'What to do today', zh: '今天要做什么' },
  bigNothing: { en: 'Nothing to do today', zh: '今天无需处理' },
  bigHerds: { en: 'The herds', zh: '各牛群' },
  bigCows: { en: '{n} cattle', zh: '{n} 头牛' },
  bigAllHere: { en: 'All here', zh: '全部在场' },
  bigShort: { en: '{n} missing', zh: '缺 {n} 头' },

  // simple view
  modeSimple: { en: 'Today', zh: '今日' },
  modeDetailed: { en: 'Full dashboard', zh: '完整看板' },
  simpleHeadlineOk: { en: 'All cattle accounted for', zh: '牛只全部清点无误' },
  simpleHeadlineMissing: { en: '{n} cattle not found this morning', zh: '今晨有 {n} 头牛未找到' },
  simpleHeadlineNoFlight: { en: 'No drone count today', zh: '今日未进行航拍清点' },
  simpleSeen: { en: 'Seen from the air', zh: '航拍已见' },
  simpleSeenFoot: { en: 'of {n} on the books', zh: '在册共 {n} 头' },
  simpleNeedsYou: { en: 'Needs you today', zh: '今日待办' },
  simpleNeedsYouFoot: { en: 'jobs on the list', zh: '项待处理' },
  simpleMovePaddocks: { en: 'Areas out of grass', zh: '牧草用尽草场' },
  simpleMoveFoot: { en: 'of {n} areas', zh: '共 {n} 个草场' },
  simpleHidden: { en: '{n} were hidden from the camera — normal', zh: '{n} 头被遮挡未拍到，属正常范围' },
  simpleMissingHerd: {
    en: '{n} cattle missing from {herd}',
    zh: '{herd} 缺 {n} 头',
  },
  simpleGrazing: { en: 'Grazing time', zh: '采食时长' },
  simpleGrazingNormal: { en: 'normal is 9–11 h', zh: '正常 9–11 小时' },
  todoTitle: { en: 'What to do today', zh: '今日待办' },
  todoSub: { en: 'Ranked by urgency, newest day first', zh: '按紧急程度排序' },
  todoEmpty: { en: 'Nothing needs attention today.', zh: '今日无需特别处理。' },
  todoEmptySub: {
    en: 'Every herd was counted, no fence was crossed and no paddock is out of grass.',
    zh: '各牛群清点齐全，无越界，草场牧草充足。',
  },
  whereTitle: { en: 'Where the cattle are', zh: '牛群位置' },
  whereSub: {
    en: 'Colour shows which areas still have grass to give',
    zh: '颜色表示各草场牧草余量',
  },
  herdCardsTitle: { en: 'Your herds', zh: '各牛群' },
  grassTableTitle: { en: 'Areas that need watching', zh: '需关注的草场' },
  grassAllFine: { en: 'The other {n} areas have plenty of grass or are resting.', zh: '其余 {n} 个草场牧草充足或正在休牧。' },
  grassLeft: { en: 'Grass left', zh: '牧草余量' },
  grassUsed: { en: 'Grass eaten this season', zh: '本季已采食' },
  state_outOfGrass: { en: 'Out of grass', zh: '牧草用尽' },
  state_watch: { en: 'Nearly used up', zh: '接近用尽' },
  state_ok: { en: 'Plenty of grass', zh: '牧草充足' },
  state_resting: { en: 'Resting', zh: '休牧中' },
  restingFor: { en: 'resting · {n} d', zh: '休牧 {n} 天' },
  grazingNow: { en: 'grazing here now', zh: '当前放牧' },
  seenToday: { en: 'seen this morning', zh: '今晨已见' },
  simpleFootnote: {
    en: '100% is all the grass an area can spare in one season. Past that, it is being eaten faster than it grows back.',
    zh: '100% 即该草场一个牧季可供采食的全部牧草。超过后，采食速度快于再生速度。',
  },
  simpleWhyDetail: { en: 'Why', zh: '依据' },
  prevDay: { en: 'Previous day', zh: '前一天' },
  nextDay: { en: 'Next day', zh: '后一天' },
  latestDay: { en: 'Latest', zh: '最新' },

  // controls
  play: { en: 'Play day', zh: '播放' },
  pause: { en: 'Pause', zh: '暂停' },
  day: { en: 'Day', zh: '日期' },
  hour: { en: 'Hour', zh: '时刻' },
  today: { en: 'Latest day', zh: '最新一天' },
  theme: { en: 'Theme', zh: '主题' },
  language: { en: '中文', zh: 'EN' },
  exportCsv: { en: 'Export CSV', zh: '导出 CSV' },
  exportReport: { en: 'Export compliance report', zh: '导出监管报表' },
  tableView: { en: 'Table', zh: '数据表' },
  chartView: { en: 'Chart', zh: '图表' },

  // KPI
  kpiDetected: { en: 'Head detected', zh: '航拍识别头数' },
  kpiDetectedFoot: { en: 'of {n} registered', zh: '登记 {n} 头' },
  kpiUnaccounted: { en: 'Unaccounted', zh: '未清点头数' },
  kpiGrazing: { en: 'Grazing time', zh: '日采食时长' },
  kpiDistance: { en: 'Distance walked', zh: '日行走距离' },
  kpiBiomass: { en: 'Standing biomass', zh: '现存生物量' },
  kpiHealth: { en: 'Grassland health', zh: '草场健康指数' },
  kpiStocking: { en: 'Stocking vs quota', zh: '载畜量 / 核定量' },
  kpiOpenAlerts: { en: 'Open alerts', zh: '待处理预警' },
  perHead: { en: 'herd average', zh: '牛群平均' },
  ranchWide: { en: 'ranch average', zh: '全场平均' },

  // map
  mapTitle: { en: 'Ranch map', zh: '牧场地图' },
  mapSub: {
    en: 'Paddock boundaries, tracked herd positions and grazing pressure',
    zh: '围栏草场、牛群定位与放牧强度',
  },
  layerPressure: { en: 'Grazing pressure', zh: '放牧强度' },
  layerBiomass: { en: 'Biomass', zh: '生物量' },
  layerUtilisation: { en: 'Utilisation', zh: '利用率' },
  layerRest: { en: 'Rest days', zh: '休牧天数' },
  layerNone: { en: 'Plain', zh: '底图' },
  showTrails: { en: 'Trails', zh: '轨迹' },
  showFlight: { en: 'Flight path', zh: '航线' },
  legendLow: { en: 'low', zh: '低' },
  legendHigh: { en: 'high', zh: '高' },
  underUsed: { en: 'under-used', zh: '利用不足' },
  atTarget: { en: 'at allowance', zh: '用满额度' },
  overUsed: { en: 'over-used', zh: '过牧' },

  // herds
  herds: { en: 'Herds', zh: '牛群' },
  herdsSub: { en: 'Tracked groups and their current paddock', zh: '在册牛群及当前所在草场' },
  head: { en: 'head', zh: '头' },
  breed: { en: 'Breed', zh: '品种' },
  paddock: { en: 'Area', zh: '草场' },
  state: { en: 'Behaviour', zh: '行为' },
  spread: { en: 'Herd spread', zh: '群体分散度' },
  position: { en: 'Position', zh: '坐标' },

  // behaviour
  grazing: { en: 'Grazing', zh: '采食' },
  ruminating: { en: 'Ruminating', zh: '反刍' },
  resting: { en: 'Resting', zh: '休息' },
  travelling: { en: 'Travelling', zh: '行走' },
  watering: { en: 'Watering', zh: '饮水' },

  behaviourTitle: { en: 'Daily behaviour budget', zh: '每日行为时间分配' },
  behaviourSub: {
    en: 'Hours per animal per day, averaged across tracked herds',
    zh: '各牛群平均每头每日小时数',
  },
  distanceTitle: { en: 'Distance walked per day', zh: '每日行走距离' },
  distanceSub: { en: 'Kilometres travelled by each herd', zh: '各牛群每日行走公里数' },
  countTitle: { en: 'Aerial count reconciliation', zh: '航拍清点核对' },
  countSub: {
    en: 'Detected head vs. registered herd book, by day',
    zh: '每日航拍识别头数与在册头数对比',
  },
  registered: { en: 'Registered', zh: '在册头数' },
  detected: { en: 'Detected', zh: '识别头数' },
  confidence: { en: 'Mean confidence', zh: '平均置信度' },

  // alerts
  alerts: { en: 'Alerts', zh: '预警' },
  alertsSub: { en: 'Rules run on every flight and every track', zh: '基于航拍与轨迹的规则告警' },
  allDays: { en: 'Season', zh: '整个牧季' },
  selectedDay: { en: 'Selected day', zh: '所选日期' },
  noAlerts: { en: 'No alerts for this day.', zh: '当日无预警。' },
  countMismatch: { en: 'Count mismatch', zh: '数量不符' },
  fenceBreach: { en: 'Fence breach', zh: '越界' },
  overgrazing: { en: 'Overgrazing', zh: '过牧' },
  waterGap: { en: 'Watering gap', zh: '饮水异常' },
  heatStress: { en: 'Heat stress', zh: '热应激' },
  animalWelfare: { en: 'Welfare flag', zh: '个体异常' },
  restViolation: { en: 'Rest period', zh: '休牧不足' },

  // grassland
  grassTitle: { en: 'Paddock condition', zh: '草场状况' },
  grassSub: {
    en: 'Standing biomass, utilisation and rest for every paddock',
    zh: '各围栏草场的生物量、利用率与休牧情况',
  },
  biomassTrendTitle: { en: 'Biomass and rainfall', zh: '生物量与降水' },
  biomassTrendSub: {
    en: 'Ranch mean standing crop against daily rainfall',
    zh: '全场平均现存生物量与日降水量',
  },
  rainfall: { en: 'Rainfall', zh: '降水' },
  biomass: { en: 'Biomass', zh: '生物量' },
  ndvi: { en: 'NDVI', zh: '植被指数' },
  utilisation: { en: 'Utilisation', zh: '利用率' },
  allowance: { en: 'Forage allowance', zh: '可利用额度' },
  atAllowance: { en: 'at allowance', zh: '用满额度' },
  restDays: { en: 'Rest days', zh: '休牧天数' },
  utilTitle: { en: 'Utilisation by paddock', zh: '各草场利用率' },
  utilSub: {
    en: 'Season offtake against the forage each paddock can safely give up — 100% is the full allowance',
    zh: '牧季累计采食量占可安全利用牧草量的比例，100% 即用满额度',
  },
  heatTitle: { en: 'Utilisation calendar', zh: '利用率日历' },
  heatSub: {
    en: 'Paddock × day across the grazing season — click a cell to jump to that day',
    zh: '草场 × 牧季日期，点击可跳转至当日',
  },
  rotationTitle: { en: 'Rotation plan', zh: '轮牧计划' },
  rotationSub: { en: 'Which herd is in which paddock, by day', zh: '各草场每日放牧牛群' },
  stockingTitle: { en: 'Stocking vs carrying capacity', zh: '实际载畜量与理论承载力' },
  stockingSub: {
    en: 'Animal units per hectare against the approved capacity of each paddock',
    zh: '各草场每公顷载畜量与核定承载力对比',
  },
  capacity: { en: 'Capacity', zh: '核定承载力' },
  stocking: { en: 'Stocking', zh: '实际载畜' },
  soilMeadow: { en: 'Alpine meadow', zh: '高山草甸' },
  soilTypical: { en: 'Meadow steppe', zh: '草甸草原' },
  soilSandy: { en: 'Stony slope', zh: '石质坡地' },

  // drone
  fleetTitle: { en: 'Mission log', zh: '飞行日志' },
  sortiesFlown: { en: 'Sorties flown', zh: '已飞架次' },
  fleetSub: { en: 'Two sorties a day: dawn muster count, evening pasture sweep', zh: '每日两架次：清晨清点、傍晚草场巡查' },
  flightId: { en: 'Flight', zh: '架次' },
  status: { en: 'Status', zh: '状态' },
  complete: { en: 'Complete', zh: '完成' },
  partial: { en: 'Shortened', zh: '缩短' },
  aborted: { en: 'Grounded', zh: '取消' },
  coverage: { en: 'Coverage', zh: '覆盖面积' },
  duration: { en: 'Duration', zh: '时长' },
  images: { en: 'Frames', zh: '影像' },
  battery: { en: 'Battery', zh: '电量消耗' },
  wind: { en: 'Wind', zh: '风速' },
  temp: { en: 'Temp', zh: '气温' },
  coverageTitle: { en: 'Area surveyed per day', zh: '每日巡查面积' },
  coverageSub: { en: 'Hectares imaged, split by mission outcome', zh: '按任务结果划分的巡查公顷数' },
  accuracyTitle: { en: 'Detection performance', zh: '识别性能' },
  accuracySub: {
    en: 'Share of registered animals detected, and model confidence',
    zh: '识别率与模型置信度',
  },
  detectionRate: { en: 'Detection rate', zh: '识别率' },
  targetLine: { en: 'Service target 97%', zh: '服务目标 97%' },

  // governance
  govTitle: { en: 'Grass–livestock balance', zh: '草畜平衡' },
  govSub: {
    en: 'Ranch stocking measured in sheep units against the approved quota',
    zh: '以羊单位计量的实际载畜量与核定载畜量',
  },
  quota: { en: 'Approved quota', zh: '核定载畜量' },
  actual: { en: 'Actual stocking', zh: '实际载畜量' },
  sheepUnits: { en: 'sheep units', zh: '羊单位' },
  compliant: { en: 'Within quota', zh: '未超载' },
  overstocked: { en: 'Overstocked', zh: '超载' },
  overloadRate: { en: 'Overload rate', zh: '超载率' },
  healthTitle: { en: 'Grassland health index', zh: '草场健康指数' },
  healthSub: {
    en: 'Composite of standing crop, utilisation and rest — 0 to 100',
    zh: '生物量、利用率与休牧的综合指数（0–100）',
  },
  degradedTitle: { en: 'Area under pressure', zh: '受压草场面积' },
  degradedSub: {
    en: 'Hectares that have used more than 85% of their forage allowance, by day',
    zh: '每日采食量超过可利用额度 85% 的草场面积',
  },
  complianceSummary: { en: 'Compliance summary', zh: '合规摘要' },
  ruleBalance: { en: 'Grass–livestock balance', zh: '草畜平衡制度' },
  ruleRest: { en: 'Rest-rotation compliance', zh: '休牧轮牧执行' },
  ruleMonitoring: { en: 'Monitoring coverage', zh: '监测覆盖率' },
  rulePassed: { en: 'Met', zh: '达标' },
  ruleWatch: { en: 'Watch', zh: '关注' },
  ruleFailed: { en: 'Not met', zh: '未达标' },
  govNote: {
    en: 'Figures are derived from drone counts and tracked positions, not from self-reported head counts — the same evidence base can support subsidy verification and seasonal grazing bans.',
    zh: '数据来源于无人机识别与轨迹监测，而非人工申报，可用于禁牧休牧核查与补奖资金发放依据。',
  },

  // shared
  paddocks: { en: 'areas', zh: '个草场' },
  hectares: { en: 'ha', zh: '公顷' },
  km: { en: 'km', zh: '公里' },
  hours: { en: 'h', zh: '小时' },
  dayShort: { en: 'D', zh: '第' },
  of: { en: 'of', zh: '/' },
  seasonToDate: { en: 'season to date', zh: '牧季累计' },
  season: { en: 'Grazing season', zh: '牧季' },
  vsPrev: { en: 'vs previous day', zh: '较前一日' },
} as const;

export type DictKey = keyof typeof DICT;

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (k: DictKey, vars?: Record<string, string | number>) => string;
  b: (v: Bilingual | undefined) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  // respect a theme the host page already committed to, then the OS preference
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'dark';
    const stamped = document.documentElement.dataset.theme;
    if (stamped === 'light' || stamped === 'dark') return stamped;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [theme, lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      theme,
      setTheme,
      t: (k, vars) => {
        let s: string = DICT[k]?.[lang] ?? k;
        if (vars) for (const [key, v] of Object.entries(vars)) s = s.replace(`{${key}}`, String(v));
        return s;
      },
      b: (v) => (v ? v[lang] : ''),
    }),
    [lang, theme],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useUi() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useUi must be used inside I18nProvider');
  return ctx;
}
