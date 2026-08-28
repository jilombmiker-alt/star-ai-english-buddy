/**
 * 阅读器页面
 * 故事阅读、TTS 播放、单词高亮、字典查询
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { db, type Story } from '@/db';
import { ttsService } from '@/services/ttsService';
import { readingProgressService } from '@/services/readingProgressService';
import { StoryContent, ReaderControls, DictionaryPopup, AiLessonDirector } from '@/components/reader';
import { ShadowingRecorder } from '@/components/buddy';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Apple, BookOpen, Cat, Dog, Hash, Mic, Moon, Package, Palette,
  Sunrise, Trees, UsersRound, Volume2, X,
} from 'lucide-react';
import styles from './ReaderPage.module.css';

type SpeedOption = 0.8 | 1.0 | 1.2;

const storyIcons: Record<string, typeof BookOpen> = {
  l1_001: Apple,
  l1_002: Cat,
  l1_003: Palette,
  l1_004: UsersRound,
  l1_005: Sunrise,
  l1_006: Hash,
  l1_007: Dog,
  l1_008: Trees,
  l1_009: Package,
  l1_010: Moon,
};

const ReaderPage: React.FC = () => {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();
  const { currentUserId } = useAppStore();

  // 故事数据
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);

  // TTS 状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);

  // 控制状态
  const [speed, setSpeed] = useState<SpeedOption>(1.0);
  const [showTranslation, setShowTranslation] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState(() => ttsService.getActiveVoiceLabel());
  const [activeVoiceName, setActiveVoiceName] = useState(() => ttsService.getActiveVoiceName());
  const [voiceChoices, setVoiceChoices] = useState(() => ttsService.getFriendlyVoiceChoices());
  const [shadowingCompleted, setShadowingCompleted] = useState(false);

  // 字典弹窗
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [showDictionary, setShowDictionary] = useState(false);

  // 已学习的单词
  const [learnedWords] = useState<Set<string>>(new Set());

  // TTS 事件订阅
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 加载故事数据
  useEffect(() => {
    const loadStory = async () => {
      if (!storyId) return;
      
      setLoading(true);
      try {
        const storyData = await db.stories.get(storyId);
        if (storyData) {
          setStory(storyData);
          // 开始阅读会话
          readingProgressService.startSession(storyId);
        } else {
          console.error('Story not found:', storyId);
        }
      } catch (error) {
        console.error('Failed to load story:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStory();

    // 清理
    return () => {
      ttsService.stop();
      unsubscribeRef.current?.();
    };
  }, [storyId]);

  // 订阅 TTS 事件
  useEffect(() => {
    unsubscribeRef.current = ttsService.subscribe((event) => {
      switch (event.type) {
        case 'start':
          setIsPlaying(true);
          setIsPaused(false);
          break;
        case 'end':
          setIsPlaying(false);
          setIsPaused(false);
          setCurrentWordIndex(-1);
          break;
        case 'word':
          if (event.wordIndex !== undefined) {
            setCurrentWordIndex(event.wordIndex);
            // 更新当前段落
            if (story?.content) {
              let wordCount = 0;
              for (let i = 0; i < story.content.length; i++) {
                wordCount += story.content[i].words.length;
                if (event.wordIndex < wordCount) {
                  setCurrentParagraphIndex(i);
                  break;
                }
              }
            }
          }
          break;
        case 'pause':
          setIsPaused(true);
          break;
        case 'resume':
          setIsPaused(false);
          break;
        case 'error':
          setIsPlaying(false);
          setIsPaused(false);
          console.error('TTS error:', event.error);
          break;
      }
    });

    return () => unsubscribeRef.current?.();
  }, [story]);

  useEffect(() => {
    const refreshVoices = () => {
      setVoiceLabel(ttsService.getActiveVoiceLabel());
      setActiveVoiceName(ttsService.getActiveVoiceName());
      setVoiceChoices(ttsService.getFriendlyVoiceChoices());
    };
    refreshVoices();
    return ttsService.subscribeVoices(refreshVoices);
  }, []);

  // 播放/暂停
  const handlePlayPause = useCallback(async () => {
    if (!story?.content) return;

    if (isPlaying) {
      if (isPaused) {
        ttsService.resume();
      } else {
        ttsService.pause();
      }
    } else {
      // 合并所有段落文本
      const fullText = story.content.map(p => p.text).join(' ');
      ttsService.setOptions({ rate: speed, pitch: 1.03, lang: 'en-US' });
      try {
        await ttsService.speak(fullText);
      } catch (error) {
        console.error('TTS speak failed:', error);
      }
    }
  }, [story, isPlaying, isPaused, speed]);

  // 从头播放，给跟读和陪练统一调用
  const handleReplay = useCallback(async () => {
    if (!story?.content) return;
    ttsService.stop();
    ttsService.setOptions({ rate: Math.min(speed, 1), pitch: 1.03, lang: 'en-US' });
    await ttsService.speak(story.content.map(paragraph => paragraph.text).join(' '));
  }, [story, speed]);

  const handleVoiceSelect = useCallback((name: string) => {
    ttsService.stop();
    ttsService.setFriendlyVoice(name);
    setVoiceLabel(ttsService.getActiveVoiceLabel());
    setActiveVoiceName(ttsService.getActiveVoiceName());
  }, []);

  const handleVoicePreview = useCallback(async (name: string) => {
    handleVoiceSelect(name);
    ttsService.setOptions({ rate: 0.9, pitch: 1.03, lang: 'en-US' });
    try {
      await ttsService.speak('Hello! I will learn English with you.');
    } catch (error) {
      console.error('Voice preview failed:', error);
    }
  }, [handleVoiceSelect]);

  // 停止播放
  const handleStop = useCallback(() => {
    ttsService.stop();
    setCurrentWordIndex(-1);
  }, []);

  // 语速切换
  const handleSpeedChange = useCallback((newSpeed: SpeedOption) => {
    setSpeed(newSpeed);
    ttsService.setRate(newSpeed);
  }, []);

  // 翻译开关
  const handleTranslationToggle = useCallback(() => {
    setShowTranslation(prev => !prev);
  }, []);

  // 跟读开关
  const handleRecordToggle = useCallback(() => {
    setIsRecording(prev => !prev);
  }, []);

  const handleRecordComplete = useCallback((audioBlob: Blob) => {
    const paragraphId = story?.content[currentParagraphIndex]?.paragraphId || 'paragraph-1';
    readingProgressService.addShadowingRecord({
      paragraphId,
      audioBlob,
      timestamp: Date.now(),
    });
    setShadowingCompleted(true);
    setIsRecording(false);
  }, [story, currentParagraphIndex]);

  const handleContinueWithoutRecording = useCallback(() => {
    // 只记录“孩子确认已开口”，不伪造音频 Blob 或发音分数。
    setShadowingCompleted(true);
    setIsRecording(false);
  }, []);

  // 单词点击 - 发音
  const handleWordClick = useCallback(async (word: string) => {
    try {
      await ttsService.speakWord(word);
    } catch (error) {
      console.error('Word TTS failed:', error);
    }
  }, []);

  // 单词长按 - 查字典
  const handleWordLongPress = useCallback((word: string) => {
    setSelectedWord(word);
    setShowDictionary(true);
    // 记录学习的单词
    readingProgressService.addLearnedWord(word);
  }, []);

  // 关闭字典
  const handleCloseDictionary = useCallback(() => {
    setShowDictionary(false);
    setSelectedWord(null);
  }, []);

  // 返回
  const handleBack = useCallback(async () => {
    // 结束阅读会话
    if (currentUserId) {
      await readingProgressService.endSession(currentUserId);
    }
    navigate('/map');
  }, [navigate, currentUserId]);

  // 完成阅读
  const handleComplete = useCallback(async () => {
    if (!storyId || !currentUserId) return;
    
    // 结束阅读会话
    await readingProgressService.endSession(currentUserId);
    // 标记故事完成
    await readingProgressService.markStoryCompleted(storyId);
    // 跳转到 Quiz
    navigate(`/quiz/${storyId}`);
  }, [storyId, currentUserId, navigate]);

  // 加载中
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>加载故事中...</p>
      </div>
    );
  }

  // 故事不存在
  if (!story) {
    return (
      <div className={styles.errorContainer}>
        <p>故事不存在</p>
        <button onClick={() => navigate('/map')}>返回地图</button>
      </div>
    );
  }

  const StoryIcon = storyIcons[story.id] || BookOpen;

  return (
    <div className={styles.container}>
      {/* 头部 */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={handleBack}>
          ← 返回
        </button>
        <h1 className={styles.title}>{story.title}</h1>
        <button className={styles.speedBtn} onClick={() => handleSpeedChange(speed === 1.2 ? 0.8 : speed === 0.8 ? 1.0 : 1.2)}>
          {speed}x
        </button>
      </header>

      {/* 插图区域 */}
      <div className={styles.illustration}>
        <motion.div
          className={styles.illustrationPlaceholder}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <StoryIcon size={76} strokeWidth={1.7} aria-label={`${story.titleCn}故事插图`} />
        </motion.div>
      </div>

      {/* 故事内容 */}
      <main className={styles.main}>
        <AiLessonDirector
          story={story}
          shadowingCompleted={shadowingCompleted}
          onPlayStory={handleReplay}
          onShowTranslation={() => setShowTranslation(true)}
          onOpenShadowing={() => setIsRecording(true)}
          onStartQuiz={handleComplete}
          onSpeakGuide={(text) => ttsService.speakGuidance(text)}
        />
        <div className={styles.storyArea}>
          <StoryContent
            paragraphs={story.content || []}
            currentWordIndex={currentWordIndex}
            currentParagraphIndex={currentParagraphIndex}
            showTranslation={showTranslation}
            learnedWords={learnedWords}
            onWordClick={handleWordClick}
            onWordLongPress={handleWordLongPress}
          />
        </div>
      </main>

      {isRecording && (
        <div className={styles.shadowingOverlay} role="dialog" aria-modal="true" aria-label="跟读练习">
          <div className={styles.shadowingCard}>
            <div className={styles.shadowingHeader}>
              <div>
                <span className={styles.shadowingEyebrow}><Mic size={16} aria-hidden="true" /> 跟读练习</span>
                <h2>听一句，说一句，再回放</h2>
              </div>
              <button type="button" onClick={() => setIsRecording(false)} aria-label="关闭跟读练习">
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <p className={styles.shadowingText}>
              {story.content[currentParagraphIndex]?.text || story.content[0]?.text}
            </p>
            <button type="button" className={styles.listenSampleBtn} onClick={handleReplay}>
              <Volume2 size={20} aria-hidden="true" /> 先听自然示范音
            </button>
            <ShadowingRecorder
              onRecordComplete={handleRecordComplete}
              onContinueWithoutRecording={handleContinueWithoutRecording}
            />
            <p className={styles.permissionNote}>麦克风只在你点击录音后申请；本次录音保存在这台设备的学习记录中。</p>
          </div>
        </div>
      )}

      {/* 控制栏 */}
      <footer className={styles.footer}>
        <ReaderControls
          isPlaying={isPlaying}
          isPaused={isPaused}
          speed={speed}
          showTranslation={showTranslation}
          isRecording={isRecording}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onSpeedChange={handleSpeedChange}
          onTranslationToggle={handleTranslationToggle}
          onRecordToggle={handleRecordToggle}
          voiceLabel={voiceLabel}
          activeVoiceName={activeVoiceName}
          voiceChoices={voiceChoices}
          onVoiceSelect={handleVoiceSelect}
          onVoicePreview={handleVoicePreview}
        />
      </footer>

      {/* 字典弹窗 */}
      <DictionaryPopup
        word={selectedWord}
        visible={showDictionary}
        onClose={handleCloseDictionary}
        onAddToWordbook={(word) => {
          logger.info('Add to wordbook', { word });
          // TODO: 实现添加到生词本
        }}
      />
    </div>
  );
};

export default ReaderPage;
