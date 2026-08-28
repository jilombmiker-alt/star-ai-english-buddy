import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, CalendarCheck, ChevronRight, Ear, Languages, MessageCircleMore,
  Mic, Play, SendHorizontal, Sparkles, Star, Theater, Trophy, Volume2,
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
type ChatRole = 'star' | 'child';
type ChatStatus = 'done' | 'streaming' | 'fallback';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  status: ChatStatus;
}

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

const modePrompts: Record<CompanionMode, string> = {
  plan: '请帮我安排今天的英语学习计划',
  reading: '我想朗读故事',
  words: '我想认识三个新单词',
  roleplay: '我想做情景演绎',
};

const welcomeMessage = `${modeCopy.plan.english}\n${modeCopy.plan.chinese}`;

const voiceStateCopy: Record<VoiceState, string> = {
  waiting: '可以听星星说、按住说话、打字或直接点建议',
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('waiting');
  const [conversationStarted, setConversationStarted] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [cloudState, setCloudState] = useState<CloudState>('idle');
  const [typedText, setTypedText] = useState('');
  const [replayingMessageId, setReplayingMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'star-welcome', role: 'star', text: welcomeMessage, status: 'done' },
  ]);
  const recognitionRef = useRef<VoiceRecognitionLike | null>(null);
  const requestInFlightRef = useRef(false);
  const messageSequenceRef = useRef(0);
  const speechSessionRef = useRef(0);
  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const nextMessageId = useCallback((role: ChatRole) => {
    messageSequenceRef.current += 1;
    return `${role}-${Date.now()}-${messageSequenceRef.current}`;
  }, []);

  const appendStarNotice = useCallback((text: string, status: ChatStatus = 'done') => {
    setMessages(previous => [...previous, { id: nextMessageId('star'), role: 'star', text, status }]);
  }, [nextMessageId]);

  const speakMessage = useCallback(async (text: string, messageId?: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    speechSessionRef.current += 1;
    const speechSession = speechSessionRef.current;
    setIsSpeaking(true);
    setReplayingMessageId(messageId ?? null);
    setVoiceState('speaking');
    ttsService.stop();
    try {
      const chineseStart = normalized.search(/[\u3400-\u9fff]/);
      const english = chineseStart < 0 ? normalized : normalized.slice(0, chineseStart).trim();
      const chinese = chineseStart < 0 ? '' : normalized.slice(chineseStart).trim();
      if (english) {
        ttsService.setOptions({ lang: 'en-US', rate: 0.88, pitch: 1.02 });
        await ttsService.speak(english);
      }
      if (chinese) await ttsService.speakGuidance(chinese);
    } catch {
      // 语音不可用时保留完整文字和所有学习入口。
    } finally {
      if (speechSessionRef.current === speechSession) {
        setIsSpeaking(false);
        setReplayingMessageId(null);
        setVoiceState(current => current === 'speaking' ? 'ready' : current);
      }
    }
  }, []);

  useEffect(() => {
    if (!initState.isComplete) return;
    const ensureUser = async () => {
      if (typeof indexedDB === 'undefined') {
        const now = Date.now();
        setUser({
          id: 'demo-user',
          name: '小魔法师',
          buddyName: '星星',
          createdAt: now,
          lastActiveAt: now,
          settings: {
            language: 'zh-CN',
            ttsSpeed: 1,
            soundEnabled: true,
            vibrationEnabled: true,
            autoPlayTTS: true,
            showTranslation: false,
          },
        });
        setCurrentUser('demo-user');
        return;
      }
      let current = await db.users.orderBy('createdAt').reverse().first();
      if (!current) current = await createUser('小魔法师', '星星');
      setUser(current);
      setCurrentUser(current.id);
    };
    void ensureUser();
  }, [initState.isComplete, setCurrentUser]);

  useEffect(() => {
    if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const startConversation = useCallback(() => {
    setConversationStarted(true);
    void speakMessage(welcomeMessage, 'star-welcome');
  }, [speakMessage]);

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
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setConversationStarted(true);
    const answer = understandChild(question);
    setMode(answer.mode);
    setSuggestedMode(answer.mode);
    setVoiceState('thinking');
    setCloudState('connecting');
    setShowChoices(true);
    const childMessageId = nextMessageId('child');
    const starMessageId = nextMessageId('star');
    setMessages(previous => [
      ...previous,
      { id: childMessageId, role: 'child', text: normalizedQuestion, status: 'done' },
      { id: starMessageId, role: 'star', text: '星星正在想一想…', status: 'streaming' },
    ]);
    let finalReply = '';
    let streamedReply = '';
    try {
      finalReply = await askStarInCloud({
        childMessage: normalizedQuestion,
        lessonContext: `孩子当前位于课程首页。星星根据表达推荐“${modeCopy[answer.mode].action}”。允许任务只有：学习计划、朗读故事、认识单词、情景演绎、今日挑战。完成本轮后应引导孩子点击“${modeCopy[answer.mode].action}”。`,
        onDelta: delta => {
          streamedReply += delta;
          setMessages(previous => previous.map(message => message.id === starMessageId
            ? { ...message, text: streamedReply, status: 'streaming' }
            : message));
        },
      });
      setMessages(previous => previous.map(message => message.id === starMessageId
        ? { ...message, text: finalReply, status: 'done' }
        : message));
      setCloudState('cloud');
    } catch {
      finalReply = answer.reply;
      setMessages(previous => previous.map(message => message.id === starMessageId
        ? { ...message, text: answer.reply, status: 'fallback' }
        : message));
      setCloudState('fallback');
    }

    try {
      await speakMessage(finalReply, starMessageId);
    } finally {
      requestInFlightRef.current = false;
      setVoiceState('choices');
    }
  }, [nextMessageId, speakMessage, understandChild]);

  const startListening = useCallback(() => {
    if (isSpeaking || voiceState === 'thinking') return;
    const speechWindow = window as unknown as {
      SpeechRecognition?: VoiceRecognitionConstructor;
      webkitSpeechRecognition?: VoiceRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState('error');
      setConversationStarted(true);
      appendStarNotice('这台浏览器暂时不能语音识别。你可以打字，或直接点下面的建议，星星照样陪你。');
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
      appendStarNotice(permissionDenied
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
    setVoiceState('listening');
    try {
      recognition.start();
    } catch {
      setVoiceState('error');
      setShowChoices(true);
    }
  }, [appendStarNotice, finishVoiceTurn, isSpeaking, voiceState]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const handleModeSelect = useCallback((nextMode: CompanionMode) => {
    void finishVoiceTurn(modePrompts[nextMode]);
  }, [finishVoiceTurn]);

  const handleTypedSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = typedText.trim();
    if (!value || voiceState === 'thinking') return;
    setTypedText('');
    void finishVoiceTurn(value);
  }, [finishVoiceTurn, typedText, voiceState]);

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
            <span className={styles.dialogueLabel}><MessageCircleMore size={17} /> 星星 AI 对话课堂</span>
            <div className={`${styles.cloudBadge} ${cloudState === 'fallback' ? styles.cloudBadgeFallback : ''}`}>
              <Sparkles size={15} />
              {cloudState === 'connecting' && '云端 AI 正在思考'}
              {cloudState === 'cloud' && '云端开放域 AI 已回应'}
              {cloudState === 'fallback' && '网络不可用 · 已切换安全课程引导'}
              {cloudState === 'idle' && '云端开放域 AI · 课程安全边界'}
            </div>
            <h1>和星星聊一聊，找到今天想学的内容</h1>
            <p>你可以说话、打字，或直接点建议。星星会理解你的想法，再一步一步带你学习。</p>

            <div className={`${styles.voiceStatus} ${voiceState === 'listening' ? styles.voiceStatusListening : ''}`} role="status" aria-live="polite">
              <span><Ear size={19} aria-hidden="true" /></span>
              <div><strong>{voiceStateCopy[voiceState]}</strong><small>中文声音：{chineseVoiceLabel}</small></div>
            </div>
            <div className={styles.chatFrame}>
              <div className={styles.chatTopline}>
                <span><MessageCircleMore size={15} aria-hidden="true" /> 对话记录</span>
                <small>点任意一条星星回复可重听</small>
              </div>
              <div ref={chatLogRef} className={styles.chatLog} role="log" aria-live="polite" aria-label="和星星的对话记录">
                {messages.map(message => message.role === 'star' ? (
                  <button
                    key={message.id}
                    type="button"
                    className={styles.starMessage}
                    onClick={() => void speakMessage(message.text, message.id)}
                    disabled={message.status === 'streaming'}
                    data-testid="chat-message-star"
                    aria-label={`星星 AI 说：${message.text}。点击重新播报`}
                  >
                    <span className={styles.messageAvatar}><Star size={16} fill="currentColor" aria-hidden="true" /></span>
                    <span className={styles.messageBody}>
                      <span className={styles.messageMeta}>
                        <strong>星星 AI</strong>
                        <small>{message.status === 'streaming' ? '正在回复…' : replayingMessageId === message.id ? '正在重听…' : '点击重听'}</small>
                      </span>
                      <span className={styles.messageText}>{message.text}</span>
                    </span>
                    <Volume2 size={17} className={styles.messageReplayIcon} aria-hidden="true" />
                  </button>
                ) : (
                  <div key={message.id} className={styles.childMessage} data-testid="chat-message-child">
                    <span className={styles.messageBody}>
                      <span className={styles.messageMeta}><strong>我</strong><small>刚刚说</small></span>
                      <span className={styles.messageText}>{message.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

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
                <button type="button" className={styles.speakBtn} onClick={() => void speakMessage(messages[messages.length - 1]?.text || welcomeMessage, messages[messages.length - 1]?.id)} disabled={isSpeaking}>
                  <Volume2 size={21} aria-hidden="true" /> {isSpeaking ? '星星在说…' : '重听上一句'}
                </button>
              </div>
            )}

            <form className={styles.askBar} onSubmit={handleTypedSubmit}>
              <label htmlFor="star-chat-input">不方便说话？打字告诉星星</label>
              <div>
                <input
                  id="star-chat-input"
                  value={typedText}
                  onChange={event => setTypedText(event.target.value)}
                  placeholder="比如：我想学三个动物单词"
                  autoComplete="off"
                  enterKeyHint="send"
                  disabled={voiceState === 'thinking'}
                  data-testid="chat-input"
                />
                <button type="submit" disabled={!typedText.trim() || voiceState === 'thinking'} aria-label="发送给星星" data-testid="chat-send">
                  <SendHorizontal size={20} aria-hidden="true" />
                </button>
              </div>
              <small>不会拼音也没关系，直接点下面的建议。</small>
            </form>

            <div className={styles.suggestionPanel} aria-labelledby="star-suggestions-title">
              <div className={styles.suggestionHeading}>
                <strong id="star-suggestions-title"><Sparkles size={16} aria-hidden="true" /> 星星建议你这样说</strong>
                <small>点一下，星星就会继续对话</small>
              </div>
              <div className={styles.suggestionChips}>
                {quickModes.map(item => {
                  const Icon = item.icon;
                  return (
                    <button key={item.mode} type="button" onClick={() => handleModeSelect(item.mode)} disabled={voiceState === 'thinking'} data-testid={`suggestion-${item.mode}`}>
                      <Icon size={18} aria-hidden="true" /> {item.mode === 'plan' ? '今日学习计划' : item.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
