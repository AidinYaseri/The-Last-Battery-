/**
 * All narrative content lives here so writing can be tweaked without touching systems.
 * Protagonist: Sam Reyes, journalist. Investigating the disappearance of Mara Vance.
 */

export const PLAYER_NAME = 'Sam';
export const PLAYER_FULL = 'Sam Reyes';
export const PLAYER_NUMBER = '+1 (555) 014-7731';

export interface ClueDef {
  title: string;
  text: string;
  major?: boolean;
  level: number;
}

export const CLUES: Record<string, ClueDef> = {
  wake: { level: 1, title: 'Woke up in the forest', text: "I woke up on the forest floor. I don't remember getting here. My phone is at 5%. It's cold, and it's dark." },
  backpack_note: { level: 1, title: 'Note in the backpack', text: '"Sam, if you\'re reading this, look at the photos. Don\'t waste the battery. You\'ll need it at the end."\n\nIt\'s my handwriting.' },
  campsite_photo: { level: 1, major: true, title: 'Polaroid at the campsite', text: "A photo of this exact campsite, same tent, same fire pit. Someone is standing by the tent. The stamp says OCT 22.\n\nI don't remember taking it. The person looks like me." },
  journal_page: { level: 1, title: 'Torn journal page', text: '"Day 2. Found Mara\'s bracelet near the fire pit. People in town say she walked into the woods on the 17th and never came back. There\'s a cabin further north they won\'t talk about. I\'ll check it tomorrow."' },
  markings: { level: 1, title: 'Marks on the trees', text: 'A spiral carved into the bark. In the photo, there was paint I couldn\'t see with my eyes:\n\n"THE ROAD IS NORTH. YOU\'VE BEEN HERE BEFORE."' },
  truck_note: { level: 1, title: 'Abandoned pickup', text: 'The registration in the glovebox: MARA VANCE.\n\nThis is her truck. It\'s been sitting here a long time.' },
  unknown_msg: { level: 2, title: 'Message from UNKNOWN', text: '"You shouldn\'t have come back."\n\nBack? I\'ve never been here.' },
  mara_poster: { level: 2, title: 'Missing poster', text: 'MISSING: MARA VANCE, 27.\nLast seen OCTOBER 17 near the Hollow Pines trail.\n\nOctober 17. The 17th keeps coming up.' },
  store_note: { level: 2, title: 'Note at the store', text: '"Marge - the Chief left his spare station key in room 4 AGAIN. The reporter from the city has that room. Get it back before he notices. - T."' },
  motel_register: { level: 2, title: 'Motel register', text: 'Room 4, S. REYES, checked in OCT 21.\nRoom 4, S. REYES, checked in OCT 25.\nRoom 4, S. REYES, checked in OCT 28.\n\nThree times. Same handwriting. Mine.\n\nA sticky note on the desk: "Room door codes = first check-in date (MMDD)."' },
  room4: { level: 2, title: 'Room 4', text: 'My jacket is on the chair. On the notepad, in my writing:\n\n"It always ends at the cabin."' },
  missing_report: { level: 2, major: true, title: 'Missing person report', text: 'NAME: SAM REYES\nREPORTED: OCT 26 by D. Okafor (employer)\nLAST SEEN: Alder Falls Motel\nSTATUS: MISSING\n\nThe photo on the report is me.' },
  radio_warning: { level: 3, major: true, title: 'Radio transmission', text: '"If you\'re hearing this, do not go back to the cabin."\n\nThen static. What cabin?' },
  gps_home: { level: 3, title: 'GPS: Destination HOME', text: 'My GPS has a saved destination: HOME, 14 Alder Ridge Road.\n\nI have never heard of that address.' },
  traffic_note: { level: 3, title: 'Note on a dashboard', text: '"Everyone just got out of their cars and walked into the trees. I\'m staying put. I\'m NOT going to the cabin." - no name.' },
  call_self: { level: 3, title: 'The call', text: 'Someone called from an unknown number. Breathing. Then a voice that sounded a lot like mine: "Don\'t go inside."' },
  cabin_sign: { level: 3, title: 'Road sign', text: 'At the end of the tunnel: CABIN - 3 KM.\n\nSo that\'s the cabin.' },
  photo_wall: { level: 4, title: 'The photo wall', text: 'Dozens of photos of me. At the campsite. In town. On the highway. Inside this cabin. Some of them look like they were taken tonight.' },
  calendar: { level: 4, title: 'Kitchen calendar', text: 'October. The 17th is circled in red with "M." written under it, and someone added: "THE DAY IT STARTED."' },
  office_sticky: { level: 4, title: 'Sticky note on the office desk', text: '"The day everything started. MMDD."' },
  case_file: { level: 4, major: true, title: 'Mara Vance case file', text: "My notes. My handwriting.\n\nMara was my friend. She came here chasing an old story: the cabin's owner, a Dr. Halvorsen, ran \"memory studies\" in the basement in the 90s. People who stayed here lost days, sometimes weeks.\n\nI came to find her. I think I found the machine instead." },
  old_phone: { level: 4, title: 'Voice memo on the old phone', text: '"Day 4. Every time I open the cabin door I lose everything after the forest. I\'m leaving myself clues. Photos. Notes. The radio. If this works, the next me will be faster."' },
  mirror: { level: 4, title: 'The mirror', text: 'In the photo of the bathroom mirror, words written in the condensation:\n\n"YOU\'VE BEEN HERE 4 TIMES."' },
  cctv: { level: 4, title: 'Security footage', text: 'The monitors show me walking into the cabin. OCT 22. OCT 25. OCT 28. Each time alone. Each time I look like I don\'t know where I am.' },
  basement_recording: { level: 4, major: true, title: 'The recording', text: 'A video of me, looking straight into the camera:\n\n"If you\'re watching this, you don\'t remember."\n\nThen it cuts out.' },
  frag_campsite: { level: 5, major: true, title: 'Memory: the campsite', text: "I remember setting up that tent on the 21st. I took the Polaroid myself on the 22nd, and left it where the next me would find it." },
  frag_motel: { level: 5, major: true, title: 'Memory: the motel', text: 'The register. Every loop, I go back to room 4 and sign in again, so I have a way to count. This is the fourth time. Maybe the fifth.' },
  frag_highway: { level: 5, major: true, title: 'Memory: the radio', text: "The voice on the radio was mine. I recorded the warning and left the car radio looping it so I'd hear it on the way here." },
  frag_tunnel: { level: 5, major: true, title: 'Memory: the machine', text: 'There is a machine in the basement. When I reach the cabin, it takes everything since the forest and I wake up again under the trees.\n\nTwo ways out. Break the machine. Or follow the white marks to the road and never look back.\n\nDon\'t follow the GPS. "Home" is the cabin.' },
  marks_path: { level: 5, title: 'White marks', text: 'In the photo of the dead tree behind the cabin: "FOLLOW THE WHITE MARKS TO THE ROAD." Now I can see them on the trees.' },
  array: { level: 5, title: 'The machine', text: 'Racks of old equipment wired into the walls. Reel-to-reel tapes, a transmitter, cables running up into the cabin door frame. It hums like it\'s breathing.' },
};

export const MAJOR_CLUES = Object.keys(CLUES).filter((k) => CLUES[k].major);

export interface ItemDef {
  name: string;
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  flashlight: { name: 'Flashlight', desc: 'A heavy metal flashlight. [F] to toggle.' },
  journal: { name: 'Journal page', desc: 'A torn page in my handwriting.' },
  polaroid: { name: 'Polaroid', desc: 'The campsite. OCT 22.' },
  bracelet: { name: 'Braided bracelet', desc: 'Red and white thread. The tag says "M."' },
  area_map: { name: 'Folded trail map', desc: 'A paper map of the Hollow Pines area.' },
  police_key: { name: 'Station key', desc: 'Keyring tag: "ALDER FALLS P.D. SPARE".' },
  car_key: { name: 'Sedan key', desc: 'A car key with a blue plastic tag.' },
  car_fuse: { name: '15A fuse', desc: 'A small blue automotive fuse.' },
  fuel_can: { name: 'Fuel can', desc: 'Half full of gasoline.' },
  gen_fuse: { name: 'Generator fuse', desc: 'A heavy cartridge fuse. "30A".' },
  basement_key: { name: 'Basement key', desc: 'Old iron key. The tag says "DOWN".' },
  old_phone: { name: 'Old phone', desc: 'A cracked flip phone with one voice memo.' },
  mara_photo: { name: 'Photo of Mara and me', desc: "We're smiling. I don't remember when this was taken." },
  cassette: { name: 'Cassette tape', desc: 'Label: "FOR ME. PLAY IN THE BASEMENT."' },
};

export interface MessageDef {
  from: 'them' | 'me';
  text: string;
  time: string;
  requires?: string;
  hideIf?: string;
}

export interface ReplyDef {
  id: string;
  text: string;
  requires?: string;
  /** flag set when sent */
  sets: string;
  /** flag set after a delay (reply arrives) */
  answer?: { flag: string; delay: number; notify: string };
}

export interface ThreadDef {
  id: string;
  name: string;
  number: string;
  requires?: string;
  messages: MessageDef[];
  replies?: ReplyDef[];
}

export const THREADS: ThreadDef[] = [
  {
    id: 'unknown',
    name: 'UNKNOWN',
    number: 'No caller ID',
    requires: 'msg_unknown1',
    messages: [
      { from: 'them', text: "You shouldn't have come back.", time: 'Today', requires: 'msg_unknown1' },
      { from: 'me', text: 'Who is this?', time: 'Today', requires: 'reply_unknown1' },
      { from: 'them', text: 'You asked that last time too.', time: 'Today', requires: 'ans_unknown1' },
      { from: 'them', text: "Don't follow it home.", time: 'Today', requires: 'msg_unknown_gps' },
      { from: 'them', text: 'Closer than last time.', time: 'Today', requires: 'msg_unknown_l4' },
      { from: 'them', text: 'Look at the number, Sam.', time: 'Now', requires: 'L5' },
      { from: 'me', text: 'Is this me?', time: 'Now', requires: 'reply_unknown2' },
      { from: 'them', text: 'Break it this time. Or walk away and never look back.', time: 'Now', requires: 'ans_unknown2' },
    ],
    replies: [
      { id: 'r1', text: 'Who is this?', requires: 'msg_unknown1', sets: 'reply_unknown1', answer: { flag: 'ans_unknown1', delay: 12, notify: 'You asked that last time too.' } },
      { id: 'r2', text: 'Is this me?', requires: 'L5', sets: 'reply_unknown2', answer: { flag: 'ans_unknown2', delay: 8, notify: 'Break it this time. Or walk away and never look back.' } },
    ],
  },
  {
    id: 'mom',
    name: 'Mom',
    number: '+1 (555) 018-2240',
    messages: [
      { from: 'them', text: 'Did you get to Alder Falls ok? Text me when you check in.', time: 'Oct 21, 18:02' },
      { from: 'me', text: 'Yeah. Motel is creepy but fine. Love you.', time: 'Oct 21, 18:40' },
      { from: 'them', text: 'Any news about Mara?', time: 'Oct 23, 09:15', hideIf: 'L5' },
      { from: 'them', text: "Sam you haven't answered in 3 days. Please call me.", time: 'Oct 26, 21:03', hideIf: 'L5' },
      { from: 'them', text: "The police say they're still looking. Please.", time: 'Oct 28, 07:30', hideIf: 'L5' },
      { from: 'them', text: 'Sam? Someone answered your phone last night and just breathed. Was that you?', time: 'Oct 29, 02:11', requires: 'L5' },
      { from: 'them', text: "It's been 12 days. I keep texting in case you can read these.", time: 'Oct 29, 02:40', requires: 'L5' },
    ],
  },
  {
    id: 'dana',
    name: 'Dana (Editor)',
    number: '+1 (555) 017-9902',
    messages: [
      { from: 'them', text: "How's the Vance piece coming? Did you find the cabin?", time: 'Oct 22, 20:12' },
      { from: 'me', text: "Found her campsite. Going north tomorrow. There's a cabin the locals won't talk about.", time: 'Oct 22, 23:50' },
      { from: 'them', text: "Sam. Don't go alone.", time: 'Oct 23, 00:05' },
      { from: 'them', text: "I filed a missing person report. Call me the second you see this.", time: 'Oct 26, 10:44' },
      { from: 'me', text: "I'm lost near Alder Falls. Please send help.", time: 'Today', requires: 'reply_dana' },
      { from: 'them', text: "Sam?? The police searched Alder Falls for a week. There's nobody there. There hasn't been for years. Where ARE you?", time: 'Today', requires: 'ans_dana' },
    ],
    replies: [{ id: 'd1', text: "I'm lost near Alder Falls. Please send help.", sets: 'reply_dana', answer: { flag: 'ans_dana', delay: 25, notify: "Sam?? The police searched Alder Falls for a week..." } }],
  },
  {
    id: 'mara',
    name: 'Mara',
    number: '+1 (555) 013-5518',
    messages: [
      { from: 'them', text: "If I don't come back by Sunday, don't come looking for me. I mean it.", time: 'Oct 16, 22:10' },
      { from: 'me', text: 'Where are you going??', time: 'Oct 16, 22:14' },
      { from: 'them', text: 'Hollow Pines. The cabin. I think the stories are true.', time: 'Oct 17, 07:44' },
      { from: 'them', text: 'it keeps resetting', time: 'Oct 17, 23:52' },
    ],
  },
];

export interface CallDef {
  name: string;
  kind: 'in' | 'out' | 'missed';
  time: string;
  duration?: string;
  requires?: string;
  hideIf?: string;
}

export const CALLS: CallDef[] = [
  { name: 'Me', kind: 'out', time: 'Oct 28, 03:10', duration: '4:31', requires: 'L5' },
  { name: 'UNKNOWN', kind: 'in', time: 'Today', duration: '0:20', requires: 'call_answered' },
  { name: 'UNKNOWN', kind: 'missed', time: 'Today', requires: 'call_missed' },
  { name: 'Mom', kind: 'missed', time: 'Oct 28, 07:29' },
  { name: 'Mom', kind: 'missed', time: 'Oct 26, 21:01' },
  { name: 'UNKNOWN', kind: 'in', time: 'Oct 25, 03:14', duration: '4:31', hideIf: 'L5' },
  { name: 'Dana (Editor)', kind: 'out', time: 'Oct 22, 23:55', duration: '1:12' },
  { name: 'Mara', kind: 'out', time: 'Oct 17, 23:53', duration: 'Failed' },
  { name: 'Mara', kind: 'missed', time: 'Oct 17, 23:52' },
];

export interface PresetPhoto {
  id: string;
  kind: import('../world/PhotoArt').PhotoKind;
  label: string;
  date: string;
  l5kind?: import('../world/PhotoArt').PhotoKind;
}

export const PRESET_PHOTOS: PresetPhoto[] = [
  { id: 'p1', kind: 'trees', label: 'IMG_1021', date: "OCT 21 '26 22:47" },
  { id: 'p2', kind: 'campsite', label: 'IMG_1022', date: "OCT 22 '26 23:14", l5kind: 'campsite_figure' },
  { id: 'p3', kind: 'motel', label: 'IMG_1025', date: "OCT 25 '26 01:02" },
  { id: 'p4', kind: 'cabin_ext', label: 'IMG_1028', date: "OCT 28 '26 03:09" },
  { id: 'p5', kind: 'portrait', label: 'IMG_1028b', date: "OCT 28 '26 03:12", l5kind: 'portrait_sleep' },
];

export const ENDINGS: Record<string, { title: string; num: number; desc: string }> = {
  escape: { num: 1, title: 'ESCAPE', desc: 'You followed the marks to the road.' },
  battery: { num: 2, title: 'BATTERY DEATH', desc: 'The screen went dark.' },
  break: { num: 3, title: 'BREAK THE LOOP', desc: 'You destroyed the machine.' },
  loop: { num: 4, title: 'HOME', desc: 'You followed the GPS home.' },
};
