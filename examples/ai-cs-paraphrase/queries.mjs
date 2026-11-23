/**
 * A paraphrase regression set: every row asks the same thing as the row above
 * it, with different words. This is the set that catches "换个说法就掉知识库".
 */
export const QUERIES = [
  { q: '种植牙术后多久可以刷牙', expect: 'implant-brush', note: '原问法' },
  { q: '种牙后能刷牙吗', expect: 'implant-brush', note: '同义替换' },
  { q: '刚做完种植牙，刷牙要注意什么', expect: 'implant-brush', note: '口语化' },
  { q: '昨天种的牙，今天能刷牙吗', expect: 'implant-brush', note: '时间换说法' },
  { q: '种植牙手术后口腔怎么清洁', expect: 'implant-brush', note: '动作换说法' },
  { q: '种完牙可以漱口吗', expect: 'implant-brush', note: '动作换说法' },
  { q: '种牙后脸肿怎么办', expect: 'implant-swelling', note: '症状换说法' },
  { q: '种植牙术后肿胀要冰敷多久', expect: 'implant-swelling', note: '原问法' },
  { q: '刚种完牙能吃火锅吗', expect: 'implant-diet', note: '场景换说法' },
  { q: '种植牙后饮食要注意什么', expect: 'implant-diet', note: '原问法' },
  { q: '种牙之后多久能正常吃饭', expect: 'implant-diet', note: '口语化' },
  { q: '种植牙术后可以喝热水吗', expect: 'implant-diet', note: '场景换说法' },
];
