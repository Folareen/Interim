import type { WordsSet } from '@interim/types';

// docs/product/overview.md (The companion) and spec section 13. Quoted exactly from public domain
// translations, checked against the online texts on 2026-10-20 (KJV via bible-api.com, Pickthall
// via alquran.cloud, JPS 1917 via Sefaria, quotes via Wikisource and Project Gutenberg). An excerpt
// may start with a capital and end with a full stop; nothing else is edited. Passages that promise a
// physical outcome, or fail either language scan, are left out. Never written, paraphrased or chosen
// by the model.

/** One passage and where it comes from. */
export interface Passage {
  text: string;
  source: string;
}

/** A words for today set as the app lists it. */
export interface WordsSetConfig {
  label: string;
  /** Shown once under the set, so each passage's source can stay short. */
  translation: string | null;
  passages: readonly Passage[];
}

export const wordsSets: Record<WordsSet, WordsSetConfig> = {
  gentle: {
    label: 'Gentle words',
    translation: null,
    passages: [
      { text: 'Hope is the thing with feathers\nThat perches in the soul,\nAnd sings the tune without the words,\nAnd never stops at all.', source: 'Emily Dickinson, Hope' },
      { text: 'You don’t have to feel ready to go out. Choosing what to wear is enough for today.', source: 'Interim' },
      { text: 'I exist as I am, that is enough.', source: 'Walt Whitman, Song of Myself' },
      { text: 'Some days, looking after yourself is washing your face and putting on something soft. That counts.', source: 'Interim' },
      { text: 'Do not disturb thyself by thinking of the whole of thy life.', source: 'Marcus Aurelius, Meditations, translated by George Long' },
      { text: 'Your reflection may look different this month. The people who love you still see you.', source: 'Interim' },
      { text: 'Although the world is full of suffering, it is full also of the overcoming of it.', source: 'Helen Keller, Optimism' },
      { text: 'You’re allowed a hard day. You’re also allowed a good one.', source: 'Interim' },
      { text: 'For nowhere either with more quiet or more freedom from trouble does a man retire than into his own soul.', source: 'Marcus Aurelius, Meditations, translated by George Long' },
      { text: 'Nobody else gets to decide what looks right on you.', source: 'Interim' },
      { text: 'Constantly then give to thyself this retreat, and renew thyself.', source: 'Marcus Aurelius, Meditations, translated by George Long' },
      { text: 'Small things count: a colour you like, a scarf that feels soft, a shirt that fits today.', source: 'Interim' },
      { text: 'How you feel about the mirror can change from one day to the next. Both days are real.', source: 'Interim' },
      { text: 'You can tell people as much or as little as you want.', source: 'Interim' },
    ],
  },
  christian: {
    label: 'Bible verses',
    translation: 'King James Version',
    passages: [
      { text: 'For the LORD seeth not as man seeth; for man looketh on the outward appearance, but the LORD looketh on the heart.', source: '1 Samuel 16:7' },
      { text: 'The LORD is nigh unto them that are of a broken heart; and saveth such as be of a contrite spirit.', source: 'Psalm 34:18' },
      { text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.', source: 'Matthew 11:28' },
      { text: 'I will praise thee; for I am fearfully and wonderfully made.', source: 'Psalm 139:14' },
      { text: 'God is our refuge and strength, a very present help in trouble.', source: 'Psalm 46:1' },
      { text: 'His compassions fail not. They are new every morning: great is thy faithfulness.', source: 'Lamentations 3:22–23' },
      { text: 'My grace is sufficient for thee: for my strength is made perfect in weakness.', source: '2 Corinthians 12:9' },
      { text: 'I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth.', source: 'Psalm 121:1–2' },
      { text: 'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.', source: 'John 14:27' },
      { text: 'Cast thy burden upon the LORD, and he shall sustain thee.', source: 'Psalm 55:22' },
      { text: 'Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself.', source: 'Matthew 6:34' },
      { text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee.', source: 'Isaiah 41:10' },
      { text: 'When thou passest through the waters, I will be with thee; and through the rivers, they shall not overflow thee.', source: 'Isaiah 43:2' },
      { text: 'Weeping may endure for a night, but joy cometh in the morning.', source: 'Psalm 30:5' },
    ],
  },
  muslim: {
    label: 'Qur’an verses',
    translation: 'Translated by Marmaduke Pickthall (1930)',
    passages: [
      { text: 'But lo! with hardship goeth ease, Lo! with hardship goeth ease.', source: 'Ash-Sharh 94:5–6' },
      { text: 'Allah tasketh not a soul beyond its scope.', source: 'Al-Baqara 2:286' },
      { text: 'Surely We created man of the best stature.', source: 'At-Tin 95:4' },
      { text: 'Verily in the remembrance of Allah do hearts find rest!', source: 'Ar-Ra’d 13:28' },
      { text: 'Thy Lord hath not forsaken thee nor doth He hate thee.', source: 'Ad-Dhuhaa 93:3' },
      { text: 'Seek help in steadfastness and prayer. Lo! Allah is with the steadfast.', source: 'Al-Baqara 2:153' },
      { text: 'We are nearer to him than his jugular vein.', source: 'Qaaf 50:16' },
      { text: 'Allah will vouchsafe, after hardship, ease.', source: 'At-Talaaq 65:7' },
      { text: 'Surely I am nigh. I answer the prayer of the suppliant when he crieth unto Me.', source: 'Al-Baqara 2:186' },
      { text: 'He is with you wheresoever ye may be.', source: 'Al-Hadid 57:4' },
      { text: 'I expose my distress and anguish only unto Allah.', source: 'Yusuf 12:86' },
      { text: 'Grieve not. Lo! Allah is with us.', source: 'At-Tawba 9:40' },
      { text: 'Fear not. Lo! I am with you twain, Hearing and Seeing.', source: 'Taa-Haa 20:46' },
      { text: 'Now surely Allah’s help is nigh.', source: 'Al-Baqara 2:214' },
    ],
  },
  jewish: {
    label: 'Tanakh verses',
    translation: 'JPS 1917',
    passages: [
      { text: 'For man looketh on the outward appearance, but the LORD looketh on the heart.', source: 'I Samuel 16:7' },
      { text: 'The LORD is nigh unto them that are of a broken heart, And saveth such as are of a contrite spirit.', source: 'Psalms 34:19' },
      { text: 'I will give thanks unto Thee, for I am fearfully and wonderfully made.', source: 'Psalms 139:14' },
      { text: 'When my cares are many within me, Thy comforts delight my soul.', source: 'Psalms 94:19' },
      { text: 'God is our refuge and strength, A very present help in trouble.', source: 'Psalms 46:2' },
      { text: 'Surely His compassions fail not. They are new every morning; Great is Thy faithfulness.', source: 'Lamentations 3:22–23' },
      { text: 'I will lift up mine eyes unto the mountains: From whence shall my help come? My help cometh from the LORD, Who made heaven and earth.', source: 'Psalms 121:1–2' },
      { text: 'Out of my straits I called upon the LORD; He answered me with great enlargement.', source: 'Psalms 118:5' },
      { text: 'Cast thy burden upon the LORD, and He will sustain thee.', source: 'Psalms 55:23' },
      { text: 'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures; He leadeth me beside the still waters. He restoreth my soul.', source: 'Psalms 23:1–3' },
      { text: 'I have set the LORD always before me; Surely He is at my right hand, I shall not be moved.', source: 'Psalms 16:8' },
      { text: 'Fear thou not, for I am with thee, Be not dismayed, for I am thy God.', source: 'Isaiah 41:10' },
      { text: 'When thou passest through the waters, I will be with thee, And through the rivers, they shall not overflow thee.', source: 'Isaiah 43:2' },
      { text: 'Weeping may tarry for the night, but joy cometh in the morning.', source: 'Psalms 30:6' },
    ],
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The passage for one day. Everyone on the same set and date gets the same one, so nothing about
 * the person shapes the choice.
 * @param date The person's local date as YYYY-MM-DD.
 */
export function wordsForDay(set: WordsSet, date: string): Passage {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
  const { passages } = wordsSets[set];
  const passage = passages[((day % passages.length) + passages.length) % passages.length];
  if (!passage) throw new Error(`No passage for ${set} on ${date}`);
  return passage;
}
