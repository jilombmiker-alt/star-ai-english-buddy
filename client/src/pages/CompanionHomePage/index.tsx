import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, CalendarCheck, ChevronRight, Ear, Languages, MessageCircleMore,
  Mic, Play, Sparkles, Star, Theater, Trophy, Volume2,
} from 'lucide-react';
import { db, createUser, type User } from '@/db';
import { useInitialization } from '@/hooks/useInitialization';
import { useAppStore } from '@/stores/useAppStore';
import { ttsService } from '@/services/ttsService';
import { askStarInCloud } from '@/services/cloudCompanionService';
import Loading from '@/components/common/Loading';
import styles from './CompanionHomePage.module.css';

type CompanionMode = 'plan' | 'reading' | 'words' | 'roleplay';
type VoiceState = 'waiting' | 'speaking' | 'ready' | 'listening' | 'thinking' | 'choices' | 'error';
type CloudState = 'idle' | 'connecting' | 'cloud' | 'fallback';

interface VoiceRecognitionResultLike {
  readonly 0: { transcript: string };
}

interface VoiceRecognitionEventLike {
  readonly results: ArrayLike<VoiceRecognitionResultLike>;
}

interface VoiceRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: VoiceRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type VoiceRecognitionConstructor = new () => VoiceRecognitionLike;

const modeCopy: Record<CompanionMode, { english: string; chinese: string; action: string }> = {
  plan: {
    english: "Hi! I'm Star. What do you want to do today?",
    chinese: '你好呀，我是星星。你可以直接告诉我：今天想读故事、学单词，还是一起演一演？',
    action: '开始今日学习',
  },
  reading: {
    english: 'Listen, read, and tell me what you find!',
    chinese: '我们先听一个小故事，再挑一句喜欢的话跟读。不会也没关系，我会给你提示。',
    action: '去朗读故事',
  },
  words: {
    english: 'Let’s find three magic words!',
    chinese: '今天认识三个新单词。先听声音，再看意思，最后把它用在一句话里。',
    action: '去认识单词',
  },
  roleplay: {
    english: 'You are the hero. Let’s act it out!',
    chinese: '你来当故事主角，我来当你的搭档。我们用最简单的英语演一小段。',
    action: '开始情景演绎',
  },
};

const quickModes: Array<{ mode: CompanionMode; label: string; sub: string; icon: typeof BookOpen }> = [
  { mode: 'plan', label: '学习计划', sub: '星星安排今天', icon: CalendarCheck },
  { mode: 'reading', label: '朗读故事', sub: '听一句，说一句', icon: BookOpen },
  { mode: 'words', label: '认识单词', sub: '每天 3 个词', icon: Languages },
  { mode: 'roleplay', label: '情景演绎', sub: '一起开口表演', icon: Theater },
];

const voiceStateCopy: Record<VoiceState, string> = {
  waiting: '点一下开始，星星会先和你打招呼',
  speaking: '星星正在温柔地和你说话…',
  ready: '轮到你啦，按住下面的按钮说话',
  listening: '星星正在认真听…松开就发送',
  thinking: '星星正在用云端大脑理解你，并安排下一步…',
  choices: '星星已经为你准备好今天的选项',
  error: '这次没有听清，可以再说一次或直接选任务',
};

const CompanionHomePage: React.FC = () => {
  const navigate = useNavigate();
  const setCurrentUser = useAppStore(state => state.setCurrentUser);
  const { state: initState } = useInitialization();
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<CompanionMode>('plan');
  const [suggestedMode, setSuggestedMode] = useState<CompanionMode>('plan');
  const [reply, setReply] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('waiting');
  const [conversationStarted, setConversationStarted] = useState(false);
  const [heardText, setHeardText] = useState<string | null>(null);
  const [showChoices, setShowChoices] = useState(false);
  const [cloudState, setCloudState] = useState<CloudState>('idle');
  const recognitionRef = useRef<VoiceRecognitionLike | null>(null);

  useEffect(() => {
    if (!initState.isComplete) return;
    const ensureUser = async () => {
      let current = await db.users.orderBy('createdAt').reverse().first();
      if (!current) current = await createUser('小魔法师', '星星');
      setUser(current);
      setCurrentUser(current.id);
    };
    void ensureUser();
  }, [initState.isComplete, setCurrentUser]);

  const speakCurrent = useCallback(async () => {
    const copy = modeCopy[mode];
    setIsSpeaking(true);
    setVoiceState('speaking');
    try {
      ttsService.setOptions({ lang: 'en-US', rate: 0.88, pitch: 1.02 });
      await ttsService.speak(copy.english);
      await ttsService.speakGuidance(copy.chinese);
    } catch {
      setReply('暂时播不出声音，但星星会继续用文字陪你。');
    } finally {
      setIsSpeaking(false);
      setVoiceState('ready');
    }
  }, [mode]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const startConversation = useCallback(() => {
    setConversationStarted(true);
    setReply(null);
    void speakCurrent();
  }, [speakCurrent]);

  const understandChild = useCallback((question: string) => {
    const lower = question.toLowerCase();
    if (/读|故事|read/.test(lower)) {
      return { mode: 'reading' as const, reply: 'Let’s read together! 我先读，你跟一句，我们一起发现故事里的秘密。' };
    }
    if (/单词|word/.test(lower)) {
      return { mode: 'words' as const, reply: 'Magic words! 今天挑三个新单词，听一听、看一看、用一用。' };
    }
    if (/演|对话|扮演|role|play/.test(lower)) {
      return { mode: 'roleplay' as const, reply: 'You are the hero! 你来当故事主角，我来做你的英语搭档。' };
    }
    if (/不想|累|难|不会/.test(lower)) {
      return { mode: 'reading' as const, reply: 'That’s okay. 没关系，我们只听一个很短的故事，我会一直陪着你。' };
    }
    if (/计划|今天学|what.*learn/.test(lower)) {
      return { mode: 'plan' as const, reply: 'Great! Today we can do three tiny missions. 好呀，今天完成三个小任务就很棒。' };
    }
    return { mode: 'plan' as const, reply: `I hear you! 我听到你说“${question}”。星星先为你准备几个简单选项。` };
  }, []);

  const finishVoiceTurn = useCallback(async (question: string) => {
    const answer = understandChild(question);
    setHeardText(question);
    setMode(answer.mode);
    setSuggestedMode(answer.mode);
    setReply('');
    setVoiceState('thinking');
    setCloudState('connecting');
    setShowChoices(true);
    let finalReply = '';
    try {
      finalReply = await askStarInCloud({
        childMessage: question,
        lessonContext: `孩子当前位于课程首页。星星根据表达推荐“${modeCopy[answer.mode].action}”。允许任务只有：学习计划、朗读故事、认识单词、情景演绎、今日挑战。完成本轮后应引导孩子点击“${modeCopy[answer.mode].action}”。`,
        onDelta: delta => setReply(previous => `${previous || ''}${delta}`),
      });
      setCloudState('cloud');
    } catch {
      finalReply = answer.reply;
      setReply(answer.reply);
      setCloudState('fallback');
    }

    try {
      const [englishLine = '', ...chineseLines] = finalReply.split(/\n+/).map(line => line.trim()).filter(Boolean);
      const chineseLine = chineseLines.join(' ');
      if (englishLine) {
        ttsService.setOptions({ lang: 'en-US', rate: 0.88, pitch: 1.02 });
        await ttsService.speak(englishLine);
      }
      if (chineseLine) await ttsService.speakGuidance(chineseLine);
    } catch {
      // 语音播放失败时仍保留文字与课程选项。
    } finally {
      setVoiceState('choices');
    }
  }, [understandChild]);

  const startListening = useCallback(() => {
    if (isSpeaking || voiceState === 'thinking') return;
    const speechWindow = window as unknown as {
      SpeechRecognition?: VoiceRecognitionConstructor;
      webkitSpeechRecognition?: VoiceRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState('error');
      setReply('这台浏览器暂时不能语音识别。你不用打字，直接从下面选择今天想做的事吧。');
      setShowChoices(true);
      return;
    }

    ttsService.stop();
    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) void finishVoiceTurn(transcript);
    };
    recognition.onerror = event => {
      const permissionDenied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
      setReply(permissionDenied
        ? '没有麦克风权限也没关系，直接选一个任务，星星照样陪你。'
        : '星星这次没有听清。你可以再按住说一次，或者直接选任务。');
      setVoiceState('error');
      setShowChoices(true);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceState(current => current === 'listening' ? 'ready' : current);
    };
    recognitionRef.current = recognition;
    setHeardText(null);
    setVoiceState('listening');
    try {
      recognition.start();
    } catch {
      setVoiceState('error');
      setShowChoices(true);
    }
  }, [finishVoiceTurn, isSpeaking, voiceState]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const handleModeSelect = useCallback((nextMode: CompanionMode) => {
    const nextCopy = modeCopy[nextMode];
    setMode(nextMode);
    setReply(`Okay! ${nextCopy.chinese}`);
    setVoiceState('choices');
    void ttsService.speakGuidance(nextCopy.chinese);
  }, []);

  const handleStartMode = useCallback(() => {
    navigate(`/map?mission=${mode}`);
  }, [mode, navigate]);

  const copy = modeCopy[mode];
  const orderedModes = useMemo(() => [
    ...quickModes.filter(item => item.mode === suggestedMode),
    ...quickModes.filter(item => item.mode !== suggestedMode),
  ], [suggestedMode]);
  const chineseVoiceLabel = ttsService.getActiveChineseVoiceLabel();

  if (initState.isChecking || initState.isInitializing || !user) {
    return <Loading fullscreen message="星星正在准备今天的冒险..." />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.sky} aria-hidden="true">
        <span className={styles.glowOne} />
        <span className={styles.glowTwo} />
        <span className={styles.starField} />
      </div>

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><Star size={22} fill="currentColor" /></span>
          <span><strong>Magic English Buddy</strong><small>和星星一起说英语</small></span>
        </div>
        <div className={styles.childBadge}><Sparkles size={16} /> {user.name}</div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.companionScene}>
            <motion.div
              className={styles.companion}
              animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              aria-label="英语伙伴星星"
            >
              <span className={styles.companionHalo} />
              <Star size={82} fill="currentColor" strokeWidth={1.5} />
              <span className={styles.face}>•ᴗ•</span>
            </motion.div>
            <div className={styles.namePlate}><span>在线陪伴</span><strong>星星 · 小星</strong></div>
          </div>

          <div className={styles.dialoguePanel}>
            <span className={styles.dialogueLabel}><MessageCircleMore size={17} /> 和星星语音对话</span>
            <div className={`${styles.cloudBadge} ${cloudState === 'fallback' ? styles.cloudBadgeFallback : ''}`}>
              <Sparkles size={15} />
              {cloudState === 'connecting' && '云端 AI 正在思考'}
              {cloudState === 'cloud' && '云端开放域 AI 已回应'}
              {cloudState === 'fallback' && '网络不可用 · 已切换安全课程引导'}
              {cloudState === 'idle' && '云端开放域 AI · 课程安全边界'}
            </div>
            <h1>{copy.english}</h1>
            <p>{copy.chinese}</p>

            <div className={`${styles.voiceStatus} ${voiceState === 'listening' ? styles.voiceStatusListening : ''}`} role="status" aria-live="polite">
              <span><Ear size={19} aria-hidden="true" /></span>
              <div><strong>{voiceStateCopy[voiceState]}</strong><small>中文声音：{chineseVoiceLabel}</small></div>
            </div>
            {heardText && <div className={styles.heardText}><span>星星听到</span><strong>“{heardText}”</strong></div>}
            {reply && <div className={styles.reply} aria-live="polite">{reply}</div>}

            {!conversationStarted ? (
              <button type="button" className={styles.startConversationBtn} onClick={startConversation}>
                <span><Volume2 size={25} aria-hidden="true" /></span>
                <strong>开始和星星聊天</strong>
                <small>星星会先问你一个问题</small>
              </button>
            ) : (
              <div className={styles.voiceActions}>
                <button
                  type="button"
                  className={`${styles.holdToTalkBtn} ${voiceState === 'listening' ? styles.holdToTalkBtnActive : ''}`}
                  onPointerDown={startListening}
                  onPointerUp={stopListening}
                  onPointerCancel={stopListening}
                  onPointerLeave={voiceState === 'listening' ? stopListening : undefined}
                  onKeyDown={event => {
                    if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) {
                      event.preventDefault();
                      startListening();
                    }
                  }}
                  onKeyUp={event => {
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      stopListening();
                    }
                  }}
                  disabled={isSpeaking || voiceState === 'thinking'}
                  aria-label="按住和星星说话，松开发送"
                >
                  <span><Mic size={25} aria-hidden="true" /></span>
                  <strong>{voiceState === 'listening' ? '正在听你说…' : '按住和星星说话'}</strong>
                  <small>{voiceState === 'listening' ? '说完松开' : '不需要打字'}</small>
                </button>
                <button type="button" className={styles.speakBtn} onClick={() => void speakCurrent()} disabled={isSpeaking}>
                  <Volume2 size={21} /> {isSpeaking ? '星星在说…' : '再听一遍'}
                </button>
              </div>
            )}
            {conversationStarted && (
              <div className={styles.demoPrompts} aria-label="无需麦克风的演示问题">
                <span>没有麦克风也能测试：</span>
                <button type="button" onClick={() => void finishVoiceTurn('我想学三个动物单词')} disabled={voiceState === 'thinking'}>我想学动物单词</button>
                <button type="button" onClick={() => void finishVoiceTurn('为什么天空是蓝色的？')} disabled={voiceState === 'thinking'}>问一个课外问题</button>
              </div>
            )}
            <p className={styles.privacyNote}>家长提示：仅将语音转写文字发送给云端模型，不上传原始录音；演示不要求姓名、学校或联系方式。</p>
            {!showChoices && (
              <button type="button" className={styles.skipVoiceBtn} onClick={() => { setShowChoices(true); setVoiceState('choices'); }}>
                现在不方便说话，直接看今日选项
              </button>
            )}
          </div>
        </section>

        {showChoices && <section className={styles.quickSection} aria-labelledby="choose-with-star">
          <div className={styles.sectionHeading}>
            <div><span>Star made this for you</span><h2 id="choose-with-star">根据刚才的对话，星星推荐这些</h2></div>
            <p>排在第一位的是星星理解后推荐的任务。</p>
          </div>
          <div className={styles.modeGrid}>
            {orderedModes.map(item => {
              const Icon = item.icon;
              const active = item.mode === mode;
              return (
                <button key={item.mode} type="button" className={active ? styles.modeCardActive : styles.modeCard} onClick={() => handleModeSelect(item.mode)} aria-pressed={active}>
                  <span className={styles.modeIcon}><Icon size={26} /></span>
                  <span>{item.mode === suggestedMode && <em>星星推荐</em>}<strong>{item.label}</strong><small>{item.sub}</small></span>
                  <ChevronRight size={20} />
                </button>
              );
            })}
          </div>
          <div className={styles.choiceActions}>
            <button type="button" className={styles.primaryBtn} onClick={handleStartMode}>
              <Play size={21} fill="currentColor" /> {copy.action}
            </button>
            <button type="button" className={styles.challengeBtn} onClick={() => navigate('/map?mission=challenge')}>
              <Trophy size={21} /> 今日挑战
            </button>
          </div>
        </section>}

        {showChoices && <section className={styles.planCard}>
          <div className={styles.planTop}>
            <div><span>Today’s little plan</span><h2>今天只完成 3 个小任务</h2></div>
            <strong>约 8 分钟</strong>
          </div>
          <div className={styles.planSteps}>
            <div><span>1</span><strong>听一个故事</strong><small>Listen first</small></div>
            <div><span>2</span><strong>认识 3 个词</strong><small>Learn words</small></div>
            <div><span>3</span><strong>开口说一句</strong><small>Speak once</small></div>
          </div>
        </section>}
      </main>
    </div>
  );
};

export default CompanionHomePage;
