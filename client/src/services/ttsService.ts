/**
 * TTS 服务
 * 使用 Web Speech API 实现文本转语音
 * 支持单词级别高亮同步、语速控制、暂停/恢复
 */

type TTSEventCallback = (event: TTSEvent) => void;

interface TTSEvent {
  type: 'start' | 'end' | 'word' | 'pause' | 'resume' | 'error';
  wordIndex?: number;
  word?: string;
  charIndex?: number;
  error?: string;
}

interface TTSOptions {
  rate?: number; // 语速 0.1-10，默认 1
  pitch?: number; // 音调 0-2，默认 1
  volume?: number; // 音量 0-1，默认 1
  lang?: string; // 语言，默认 'en-US'
  voice?: string; // 指定语音名称
}

export interface FriendlyVoiceChoice {
  name: string;
  label: string;
  lang: string;
}

interface WordBoundary {
  word: string;
  start: number; // 字符起始位置
  end: number; // 字符结束位置
  index: number; // 单词索引
}

class TTSService {
  private synthesis: SpeechSynthesis | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private isPlaying = false;
  private isPaused = false;
  private currentWordIndex = 0;
  private wordBoundaries: WordBoundary[] = [];
  private listeners: Set<TTSEventCallback> = new Set();
  private voiceListeners: Set<() => void> = new Set();
  private options: TTSOptions = {
    rate: 1,
    pitch: 1,
    volume: 1,
    lang: 'en-US',
  };

  constructor() {
    // 安全检查：某些浏览器/环境可能不支持 speechSynthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
      this.synthesis = window.speechSynthesis;
      this.loadVoices();

      // 某些浏览器需要等待 voiceschanged 事件
      if (this.synthesis.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  /**
   * 加载可用语音
   */
  private loadVoices(): void {
    if (!this.synthesis) return;
    const nextVoices = this.synthesis.getVoices();
    const previousKey = this.voices.map(voice => `${voice.name}:${voice.lang}`).join('|');
    const nextKey = nextVoices.map(voice => `${voice.name}:${voice.lang}`).join('|');
    this.voices = nextVoices;
    if (previousKey !== nextKey) {
      this.voiceListeners.forEach(listener => listener());
    }
  }

  /**
   * 获取可用的英语语音列表
   */
  getEnglishVoices(): SpeechSynthesisVoice[] {
    this.loadVoices();
    return this.voices.filter(voice => voice.lang.startsWith('en') || voice.lang.startsWith('EN'));
  }

  /**
   * 给儿童英语优先选择清晰、自然的英语语音，并避开系统趣味音效。
   */
  private scoreVoice(voice: SpeechSynthesisVoice): number {
    const name = voice.name.toLowerCase();
    const preferredNames = [
      'samantha', 'ava', 'allison', 'zoe', 'jenny', 'aria',
      'google us english', 'zira', 'victoria', 'karen', 'daniel',
      'moira', 'tessa', 'fiona', 'serena', 'kate', 'olivia',
      'susan', 'tom', 'alex', 'aaron', 'nicky', 'joelle',
    ];
    const noveltyNames = [
      'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
      'deranged', 'good news', 'hysterical', 'organ', 'superstar',
      'trinoids', 'whisper', 'wobble', 'zarvox', 'fred', 'junior',
      'kathy', 'princess', 'ralph',
    ];

    if (noveltyNames.some(item => name.includes(item))) return -1000;

    const preferredIndex = preferredNames.findIndex(item => name.includes(item));
    const preferredScore = preferredIndex >= 0 ? 300 - preferredIndex * 12 : 0;
    const localScore = voice.localService ? 70 : 0;
    const localeScore = voice.lang.toLowerCase() === 'en-us' ? 50 : 25;
    const defaultScore = voice.default ? 10 : 0;
    return preferredScore + localScore + localeScore + defaultScore;
  }

  private getSavedVoiceName(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('magic-english-friendly-voice');
  }

  private getVoiceLabel(voice: SpeechSynthesisVoice): string {
    const locale = voice.lang.toLowerCase();
    const accent = locale === 'en-us'
      ? '美式'
      : locale === 'en-gb'
        ? '英式'
        : locale === 'en-au'
          ? '澳式'
          : locale === 'en-ca'
            ? '加式'
            : '英语';
    const shortName = voice.name.replace(/Microsoft|Google|English|United States/gi, '').trim();
    return `${shortName || '自然声'} · ${accent}`;
  }

  getFriendlyVoiceChoices(): FriendlyVoiceChoice[] {
    return [...this.getEnglishVoices()]
      .sort((a, b) => this.scoreVoice(b) - this.scoreVoice(a))
      // 只给儿童展示明确识别为自然人声的候选，未知系统音色不冒险进入列表。
      .filter(voice => this.scoreVoice(voice) > 150)
      .slice(0, 4)
      .map(voice => ({
        name: voice.name,
        label: this.getVoiceLabel(voice),
        lang: voice.lang,
      }));
  }

  getActiveVoiceLabel(): string {
    const voice = this.getRecommendedVoice();
    return voice ? this.getVoiceLabel(voice) : '自然英语';
  }

  getActiveVoiceName(): string | null {
    return this.getRecommendedVoice()?.name ?? null;
  }

  setFriendlyVoice(name: string): void {
    const voice = this.getEnglishVoices().find(item => item.name === name);
    if (!voice) return;
    this.options.voice = voice.name;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('magic-english-friendly-voice', voice.name);
    }
    this.voiceListeners.forEach(listener => listener());
  }

  cycleFriendlyVoice(): string {
    const choices = this.getFriendlyVoiceChoices();
    if (choices.length === 0) return '自然英语';
    const currentName = this.getRecommendedVoice()?.name;
    const currentIndex = choices.findIndex(choice => choice.name === currentName);
    const nextChoice = choices[(currentIndex + 1 + choices.length) % choices.length] ?? choices[0];
    if (nextChoice) this.setFriendlyVoice(nextChoice.name);
    return nextChoice?.label ?? '自然英语';
  }

  subscribeVoices(listener: () => void): () => void {
    this.voiceListeners.add(listener);
    return () => this.voiceListeners.delete(listener);
  }

  /**
   * 获取推荐的语音
   */
  getRecommendedVoice(): SpeechSynthesisVoice | null {
    const englishVoices = this.getEnglishVoices();
    const requestedName = this.options.voice || this.getSavedVoiceName();
    const requestedVoice = requestedName
      ? englishVoices.find(voice => voice.name === requestedName)
      : null;
    if (requestedVoice) return requestedVoice;

    return [...englishVoices].sort((a, b) => this.scoreVoice(b) - this.scoreVoice(a))[0] || null;
  }

  private getRecommendedChineseVoice(): SpeechSynthesisVoice | null {
    this.loadVoices();
    const chineseVoices = this.voices.filter(voice => voice.lang.toLowerCase().startsWith('zh'));
    // 优先选择常见的自然女性中文音色；顺序兼顾 macOS、Windows 与移动端。
    const preferredNames = [
      'ting-ting', 'tingting', 'xiaoxiao', 'meijia', 'sin-ji',
      'huihui', 'yaoyao', 'xiaoyi', 'xiaohan', 'mandarin female',
    ];
    return [...chineseVoices].sort((a, b) => {
      const aIndex = preferredNames.findIndex(name => a.name.toLowerCase().includes(name));
      const bIndex = preferredNames.findIndex(name => b.name.toLowerCase().includes(name));
      const aScore = (aIndex >= 0 ? 200 - aIndex * 10 : 0) + (a.localService ? 50 : 0);
      const bScore = (bIndex >= 0 ? 200 - bIndex * 10 : 0) + (b.localService ? 50 : 0);
      return bScore - aScore;
    })[0] ?? null;
  }

  getActiveChineseVoiceLabel(): string {
    const voice = this.getRecommendedChineseVoice();
    if (!voice) return '系统温柔中文女声';
    const shortName = voice.name.replace(/Microsoft|Google|Chinese|Mandarin/gi, '').trim();
    return `${shortName || '自然中文'} · 温柔女声`;
  }

  /**
   * 播放课程导演的中文引导。与英语示范音分开选声，避免英语音色朗读中文。
   */
  speakGuidance(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synthesis) {
        reject(new Error('TTS not supported'));
        return;
      }

      this.stop();
      this.utterance = new SpeechSynthesisUtterance(text);
      // 稍慢、不过度抬高音调，减少机械和尖锐感。
      this.utterance.rate = 0.9;
      this.utterance.pitch = 0.98;
      this.utterance.volume = this.options.volume || 1;
      this.utterance.lang = 'zh-CN';

      const voice = this.getRecommendedChineseVoice();
      if (voice) this.utterance.voice = voice;

      this.utterance.onstart = () => {
        this.isPlaying = true;
        this.isPaused = false;
        this.emit({ type: 'start' });
      };
      this.utterance.onend = () => {
        this.isPlaying = false;
        this.isPaused = false;
        this.emit({ type: 'end' });
        resolve();
      };
      this.utterance.onerror = event => {
        this.isPlaying = false;
        this.isPaused = false;
        const errorMsg = event.error || 'Unknown TTS error';
        this.emit({ type: 'error', error: errorMsg });
        reject(new Error(errorMsg));
      };

      this.synthesis.speak(this.utterance);
    });
  }

  /**
   * 解析文本的单词边界
   */
  private parseWordBoundaries(text: string): WordBoundary[] {
    const boundaries: WordBoundary[] = [];
    const words = text.split(/(\s+)/);
    let charIndex = 0;
    let wordIndex = 0;

    for (const segment of words) {
      if (segment.trim()) {
        boundaries.push({
          word: segment,
          start: charIndex,
          end: charIndex + segment.length,
          index: wordIndex,
        });
        wordIndex++;
      }
      charIndex += segment.length;
    }

    return boundaries;
  }

  /**
   * 根据字符位置查找当前单词索引
   */
  private findWordIndexByCharIndex(charIndex: number): number {
    for (const boundary of this.wordBoundaries) {
      if (charIndex >= boundary.start && charIndex < boundary.end) {
        return boundary.index;
      }
    }
    return this.currentWordIndex;
  }

  /**
   * 设置 TTS 选项
   */
  setOptions(options: Partial<TTSOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 获取当前语速
   */
  getRate(): number {
    return this.options.rate || 1;
  }

  /**
   * 设置语速
   */
  setRate(rate: number): void {
    this.options.rate = Math.max(0.5, Math.min(2, rate));

    // 如果正在播放，需要重新开始
    if (this.isPlaying && this.utterance) {
      const currentText = this.utterance.text;
      this.stop();
      this.speak(currentText);
    }
  }

  /**
   * 订阅事件
   */
  subscribe(callback: TTSEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 触发事件
   */
  private emit(event: TTSEvent): void {
    this.listeners.forEach(callback => callback(event));
  }

  /**
   * 播放文本
   */
  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 检查 TTS 是否可用
      if (!this.synthesis) {
        reject(new Error('TTS not supported'));
        return;
      }

      // 停止之前的播放
      this.stop();

      // 解析单词边界
      this.wordBoundaries = this.parseWordBoundaries(text);
      this.currentWordIndex = 0;

      // 创建新的 utterance
      this.utterance = new SpeechSynthesisUtterance(text);

      // 应用选项
      this.utterance.rate = this.options.rate || 1;
      this.utterance.pitch = this.options.pitch || 1;
      this.utterance.volume = this.options.volume || 1;
      this.utterance.lang = this.options.lang || 'en-US';

      // 设置语音
      const voice = this.getRecommendedVoice();
      if (voice) {
        this.utterance.voice = voice;
      }

      // 事件处理
      this.utterance.onstart = () => {
        this.isPlaying = true;
        this.isPaused = false;
        this.emit({ type: 'start' });
      };

      this.utterance.onend = () => {
        this.isPlaying = false;
        this.isPaused = false;
        this.emit({ type: 'end' });
        resolve();
      };

      this.utterance.onerror = event => {
        this.isPlaying = false;
        this.isPaused = false;
        const errorMsg = event.error || 'Unknown TTS error';
        this.emit({ type: 'error', error: errorMsg });
        reject(new Error(errorMsg));
      };

      // 单词边界事件（不是所有浏览器都支持）
      this.utterance.onboundary = event => {
        if (event.name === 'word') {
          const wordIndex = this.findWordIndexByCharIndex(event.charIndex);
          this.currentWordIndex = wordIndex;
          const boundary = this.wordBoundaries[wordIndex];

          this.emit({
            type: 'word',
            wordIndex,
            word: boundary?.word,
            charIndex: event.charIndex,
          });
        }
      };

      // 开始播放
      this.synthesis.speak(this.utterance);
    });
  }

  /**
   * 播放单个单词
   */
  speakWord(word: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 检查 TTS 是否可用
      if (!this.synthesis) {
        reject(new Error('TTS not supported'));
        return;
      }

      // 取消之前的播放但不重置状态
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(word);
      utterance.rate = (this.options.rate || 1) * 0.9; // 单词稍慢
      utterance.pitch = this.options.pitch || 1;
      utterance.volume = this.options.volume || 1;
      utterance.lang = this.options.lang || 'en-US';

      const voice = this.getRecommendedVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error('Word TTS failed'));

      this.synthesis.speak(utterance);
    });
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (!this.synthesis) return;
    if (this.isPlaying && !this.isPaused) {
      this.synthesis.pause();
      this.isPaused = true;
      this.emit({ type: 'pause' });
    }
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (!this.synthesis) return;
    if (this.isPaused) {
      this.synthesis.resume();
      this.isPaused = false;
      this.emit({ type: 'resume' });
    }
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (!this.synthesis) return;
    this.synthesis.cancel();
    this.isPlaying = false;
    this.isPaused = false;
    this.currentWordIndex = 0;
    this.utterance = null;
  }

  /**
   * 切换播放/暂停
   */
  toggle(): void {
    if (this.isPaused) {
      this.resume();
    } else if (this.isPlaying) {
      this.pause();
    }
  }

  /**
   * 获取播放状态
   */
  getStatus(): { isPlaying: boolean; isPaused: boolean; currentWordIndex: number } {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentWordIndex: this.currentWordIndex,
    };
  }

  /**
   * 检查是否支持 TTS
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && !!window.speechSynthesis;
  }
}

// 单例导出
export const ttsService = new TTSService();
export default ttsService;
