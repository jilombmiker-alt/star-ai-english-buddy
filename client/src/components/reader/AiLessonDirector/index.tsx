import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Headphones, Keyboard, Mic, RotateCcw, Send, Sparkles, Volume2 } from 'lucide-react';
import type { Story } from '@/db';
import { dictionaryService } from '@/services/dictionaryService';
import styles from './AiLessonDirector.module.css';

type LessonPhase = 'mission' | 'listening' | 'check' | 'shadow' | 'quiz';

interface ChatMessage {
  id: string;
  role: 'director' | 'child';
  text: string;
}

interface SpeechResultEvent {
  results: { 0: { 0: { transcript: string } } };
}

interface SpeechErrorEvent {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface AiLessonDirectorProps {
  story: Story;
  shadowingCompleted: boolean;
  onPlayStory: () => Promise<void>;
  onShowTranslation: () => void;
  onOpenShadowing: () => void;
  onStartQuiz: () => void;
  onSpeakGuide: (text: string) => Promise<void>;
}

const phaseOrder: LessonPhase[] = ['mission', 'listening', 'check', 'shadow', 'quiz'];
const phaseNames: Record<LessonPhase, string> = {
  mission: '认识任务',
  listening: '听故事',
  check: '说出关键词',
  shadow: '跟读一句',
  quiz: '闯关挑战',
};

const cleanWord = (word: string) => word.toLowerCase().replace(/[^a-z'-]/g, '');

export const AiLessonDirector: React.FC<AiLessonDirectorProps> = ({
  story,
  shadowingCompleted,
  onPlayStory,
  onShowTranslation,
  onOpenShadowing,
  onStartQuiz,
  onSpeakGuide,
}) => {
  const storageKey = `magic-english-lesson-phase:${story.id}`;
  const [phase, setPhase] = useState<LessonPhase>(() => {
    const saved = window.localStorage.getItem(storageKey) as LessonPhase | null;
    return saved && phaseOrder.includes(saved) ? saved : 'mission';
  });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'director',
      text: `嗨！我是小星。今天我会带你学《${story.titleCn}》，不用自己猜下一步。`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('按住说话，也可以打字');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const storyWords = useMemo(() => {
    const words = story.content.flatMap(paragraph => paragraph.words.map(item => cleanWord(item.word)));
    return new Set(words.filter(word => word.length > 1));
  }, [story]);

  const keywordExamples = useMemo(() => Array.from(storyWords).slice(-4).join('、'), [storyWords]);
  const currentStep = phaseOrder.indexOf(phase) + 1;

  useEffect(() => {
    window.localStorage.setItem(storageKey, phase);
  }, [phase, storageKey]);

  useEffect(() => {
    if (shadowingCompleted && phase === 'shadow') {
      const text = `跟读完成！现在去做 ${story.quiz.length} 道小挑战，就能获得 ${story.rewards.magicPower} 点魔力。`;
      setPhase('quiz');
      setMessages(items => [...items, { id: `shadow-${Date.now()}`, role: 'director', text }]);
      void onSpeakGuide(text).catch(() => undefined);
    }
  }, [shadowingCompleted, phase, story.quiz.length, story.rewards.magicPower, onSpeakGuide]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const say = useCallback((text: string) => {
    setMessages(items => [...items.slice(-5), { id: `ai-${Date.now()}`, role: 'director', text }]);
    void onSpeakGuide(text).catch(() => undefined);
  }, [onSpeakGuide]);

  const startCourse = useCallback(async () => {
    const intro = `这一章有四个任务：听懂故事，说出一个你听到的英文词，跟读一句，再完成 ${story.quiz.length} 道挑战。准备好，我们先听故事。`;
    setMessages(items => [...items.slice(-5), { id: `intro-${Date.now()}`, role: 'director', text: intro }]);
    setPhase('listening');
    try {
      await onSpeakGuide(intro);
      await onPlayStory();
      const checkText = '听完啦！请按住话筒，说一个你刚刚听到的英文词。';
      setPhase('check');
      setMessages(items => [...items.slice(-5), { id: `check-${Date.now()}`, role: 'director', text: checkText }]);
      await onSpeakGuide(checkText);
    } catch {
      setSpeechStatus('语音播放失败，但可以继续看文字完成课程');
    }
  }, [onPlayStory, onSpeakGuide, story.quiz.length]);

  const replayStory = useCallback(async () => {
    const prompt = '没问题，我再慢一点读一遍。听完还是只要说出一个英文词。';
    setPhase('listening');
    setMessages(items => [...items.slice(-5), { id: `replay-${Date.now()}`, role: 'director', text: prompt }]);
    try {
      await onSpeakGuide(prompt);
      await onPlayStory();
      setPhase('check');
      say('这次听到了什么？按住话筒，说一个英文词就可以。');
    } catch {
      setSpeechStatus('暂时播不出声音，你可以打开翻译或继续打字');
    }
  }, [onPlayStory, onSpeakGuide, say]);

  const handleChildMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setMessages(items => [...items.slice(-5), { id: `child-${Date.now()}`, role: 'child', text }]);
    setInput('');

    const lower = text.toLowerCase();
    const englishTokens = lower.match(/[a-z][a-z'-]*/g) ?? [];
    const matchedKeyword = englishTokens.find(token => storyWords.has(cleanWord(token)));

    if (phase === 'check' && matchedKeyword) {
      const response = `答对啦！“${matchedKeyword}”就在这个故事里。下一步，我带你跟读一句。`;
      setPhase('shadow');
      say(response);
      window.setTimeout(onOpenShadowing, 650);
      return;
    }

    if (/没听清|再听|重播|再来|repeat/.test(lower)) {
      await replayStory();
      return;
    }

    if (/翻译|中文|讲什么|看不懂/.test(lower)) {
      onShowTranslation();
      say(`我已经打开中文。这个故事叫《${story.titleCn}》。看完中文后，我们继续${phaseNames[phase]}。`);
      return;
    }

    const meaningMatch = lower.match(/([a-z][a-z'-]*)\s*(?:是什么意思|什么意思|meaning)/);
    if (meaningMatch?.[1]) {
      const entry = await dictionaryService.lookup(meaningMatch[1]);
      say(entry
        ? `${entry.word} 的意思是“${entry.meaningCn}”。现在回到任务：${phaseNames[phase]}。`
        : `我在离线词典里还没找到 ${meaningMatch[1]}。你可以长按故事里的单词查词；我们先继续${phaseNames[phase]}。`);
      return;
    }

    if (/太难|不会|不想|帮我|提示/.test(lower)) {
      onShowTranslation();
      if (phase === 'check') {
        say(`我们把任务变简单：只要说一个词就行，比如 ${keywordExamples || 'story'}。`);
      } else {
        say(`没关系，我们一次只做一小步。现在只做“${phaseNames[phase]}”，我会陪着你。`);
      }
      return;
    }

    if (/下一步|继续|准备好了|开始/.test(lower)) {
      if (phase === 'mission' || phase === 'listening') await startCourse();
      else if (phase === 'check') say(`先完成这一小步：说一个故事里的英文词，比如 ${keywordExamples || 'apple'}。`);
      else if (phase === 'shadow') onOpenShadowing();
      else onStartQuiz();
      return;
    }

    if (phase === 'check') {
      say(`我听到了“${text}”，但还没找到故事里的英文词。再试一个，比如 ${keywordExamples || 'apple'}。`);
      return;
    }

    say(`这个问题我先记住。现在这章要完成的是：听故事、说关键词、跟读和挑战。我们先回到“${phaseNames[phase]}”。`);
  }, [keywordExamples, onOpenShadowing, onShowTranslation, onStartQuiz, phase, replayStory, say, startCourse, story.titleCn, storyWords]);

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechStatus('这个浏览器不支持语音识别，请用下方文字输入');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = phase === 'check' ? 'en-US' : 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = event.results[0][0].transcript;
      setSpeechStatus(`我听到：${transcript}`);
      void handleChildMessage(transcript);
    };
    recognition.onerror = event => {
      const permissionDenied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
      setSpeechStatus(permissionDenied ? '麦克风未允许，请改用文字输入' : '这次没听清，请按住再说一次');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      setSpeechStatus(phase === 'check' ? '正在听英文词，松开发送' : '正在听你说话，松开发送');
    } catch {
      setSpeechStatus('话筒还没准备好，请稍后再试或直接打字');
    }
  }, [handleChildMessage, phase]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const primaryAction = () => {
    if (phase === 'mission') return { label: '让小星带我学', icon: <Sparkles size={20} />, action: () => void startCourse() };
    if (phase === 'listening') return { label: '重新听故事', icon: <Headphones size={20} />, action: () => void replayStory() };
    if (phase === 'check') return { label: '给我一个提示', icon: <Volume2 size={20} />, action: () => say(`说一个故事里的英文词就行，比如 ${keywordExamples || 'apple'}。`) };
    if (phase === 'shadow') return { label: '开始跟读一句', icon: <Mic size={20} />, action: onOpenShadowing };
    return { label: `进入 ${story.quiz.length} 道挑战`, icon: <Check size={20} />, action: onStartQuiz };
  };
  const primary = primaryAction();

  return (
    <section className={styles.director} aria-label="AI 课程导演">
      <div className={styles.heading}>
        <div className={styles.avatar}><Bot size={25} aria-hidden="true" /></div>
        <div>
          <div className={styles.eyebrow}>AI 课程导演 · 小星</div>
          <h2>我带你一步一步学</h2>
        </div>
        <span className={styles.stepCount}>{currentStep}/5</span>
      </div>

      <div className={styles.steps} aria-label={`课程进度，第 ${currentStep} 步，共 5 步`}>
        {phaseOrder.map((item, index) => (
          <span key={item} className={index < currentStep ? styles.stepDone : styles.step} title={phaseNames[item]} />
        ))}
      </div>

      <div className={styles.currentTask}>
        <span>现在做</span>
        <strong>{phaseNames[phase]}</strong>
        <p>本章目标：听懂故事 · 说 1 个词 · 跟读 1 句 · 挑战 {story.quiz.length} 题</p>
      </div>

      <div className={styles.chat} aria-live="polite">
        {messages.slice(-4).map(message => (
          <div key={message.id} className={message.role === 'director' ? styles.aiMessage : styles.childMessage}>
            {message.text}
          </div>
        ))}
      </div>

      <button type="button" className={styles.primaryAction} onClick={primary.action}>
        {primary.icon}{primary.label}
      </button>

      <div className={styles.voiceRow}>
        <button
          type="button"
          className={isListening ? styles.talkButtonActive : styles.talkButton}
          onPointerDown={event => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            startListening();
          }}
          onPointerUp={stopListening}
          onPointerCancel={stopListening}
          onKeyDown={event => {
            if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
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
          aria-label="按住说话，松开发送"
        >
          <Mic size={24} aria-hidden="true" />
          <span>{isListening ? '松开发送' : '按住说话'}</span>
        </button>
        <div className={styles.speechStatus}>{speechStatus}</div>
      </div>

      <form className={styles.textForm} onSubmit={event => { event.preventDefault(); void handleChildMessage(input); }}>
        <Keyboard size={18} aria-hidden="true" />
        <input value={input} onChange={event => setInput(event.target.value)} placeholder="也可以问：apple 是什么意思？" aria-label="给小星输入文字" />
        <button type="submit" disabled={!input.trim()} aria-label="发送"><Send size={19} /></button>
      </form>

      <div className={styles.disclosure}>
        <span>本地章节引擎会记住当前任务；未连接云端大模型</span>
        <button type="button" onClick={() => { setPhase('mission'); window.localStorage.removeItem(storageKey); say('课程已经重新开始。准备好后，我会从第一步带你学。'); }}>
          <RotateCcw size={14} /> 重学本章
        </button>
      </div>
    </section>
  );
};

export default AiLessonDirector;
