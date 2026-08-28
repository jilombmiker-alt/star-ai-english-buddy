/**
 * ReaderControls 组件
 * 阅读器底部控制栏：播放/暂停、语速、跟读、翻译
 */

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { BookOpenText, Check, Gauge, Mic, Pause, Play, Square, Volume2, X } from 'lucide-react';
import type { FriendlyVoiceChoice } from '@/services/ttsService';
import styles from './ReaderControls.module.css';

type SpeedOption = 0.8 | 1.0 | 1.2;

interface ReaderControlsProps {
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 是否暂停 */
  isPaused: boolean;
  /** 当前语速 */
  speed: SpeedOption;
  /** 是否显示翻译 */
  showTranslation: boolean;
  /** 是否在录音模式 */
  isRecording: boolean;
  /** 播放/暂停回调 */
  onPlayPause: () => void;
  /** 停止回调 */
  onStop: () => void;
  /** 语速切换回调 */
  onSpeedChange: (speed: SpeedOption) => void;
  /** 翻译开关回调 */
  onTranslationToggle: () => void;
  /** 跟读模式回调 */
  onRecordToggle: () => void;
  /** 当前自然语音名称 */
  voiceLabel: string;
  /** 当前自然语音系统名称 */
  activeVoiceName: string | null;
  /** 适合儿童的可用音色 */
  voiceChoices: FriendlyVoiceChoice[];
  /** 选择音色 */
  onVoiceSelect: (name: string) => void;
  /** 试听音色 */
  onVoicePreview: (name: string) => void;
}

export const ReaderControls = memo<ReaderControlsProps>(({
  isPlaying,
  isPaused,
  speed,
  showTranslation,
  isRecording,
  onPlayPause,
  onStop,
  onSpeedChange,
  onTranslationToggle,
  onRecordToggle,
  voiceLabel,
  activeVoiceName,
  voiceChoices,
  onVoiceSelect,
  onVoicePreview,
}) => {
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  // 语速选项
  const speedOptions: SpeedOption[] = [0.8, 1.0, 1.2];
  
  // 获取下一个语速
  const getNextSpeed = (): SpeedOption => {
    const currentIndex = speedOptions.indexOf(speed);
    return speedOptions[(currentIndex + 1) % speedOptions.length] as SpeedOption;
  };

  return (
    <div className={styles.controls}>
      {/* 翻译按钮 */}
      <button
        className={clsx(styles.controlBtn, styles.translationBtn, showTranslation && styles.active)}
        onClick={onTranslationToggle}
        title={showTranslation ? '隐藏翻译' : '显示翻译'}
      >
        <BookOpenText className={styles.btnIcon} size={24} aria-hidden="true" />
        <span className={styles.btnLabel}>翻译</span>
      </button>

      {/* 语速按钮 */}
      <button
        className={styles.controlBtn}
        onClick={() => onSpeedChange(getNextSpeed())}
        title={`当前语速: ${speed}x`}
      >
        <Gauge className={styles.btnIcon} size={24} aria-hidden="true" />
        <span className={styles.btnLabel}>{speed}x</span>
      </button>

      {/* 自然语音按钮 */}
      <button
        className={clsx(styles.controlBtn, styles.voiceBtn)}
        onClick={() => setShowVoicePicker(true)}
        title={`当前音色：${voiceLabel}，点击选择`}
        aria-label={`当前音色${voiceLabel}，点击选择`}
      >
        <Volume2 className={styles.btnIcon} size={23} aria-hidden="true" />
        <span className={styles.btnLabel}>{voiceLabel}</span>
      </button>

      {/* 播放/暂停按钮（主按钮） */}
      <motion.button
        className={clsx(styles.controlBtn, styles.playBtn, (isPlaying && !isPaused) && styles.playing)}
        onClick={onPlayPause}
        whileTap={{ scale: 0.95 }}
      >
        <motion.span
          className={styles.playIcon}
          animate={{ scale: isPlaying && !isPaused ? [1, 1.1, 1] : 1 }}
          transition={{ repeat: isPlaying && !isPaused ? Infinity : 0, duration: 1 }}
        >
          {isPlaying && !isPaused
            ? <Pause size={28} fill="currentColor" aria-hidden="true" />
            : <Play size={28} fill="currentColor" aria-hidden="true" />}
        </motion.span>
        <span className={styles.btnLabel}>
          {isPlaying && !isPaused ? '暂停' : isPaused ? '继续' : '播放'}
        </span>
      </motion.button>

      {/* 跟读按钮 */}
      <button
        className={clsx(styles.controlBtn, styles.recordBtn, isRecording && styles.recording)}
        onClick={onRecordToggle}
        title={isRecording ? '停止录音' : '开始跟读'}
      >
        <Mic className={styles.btnIcon} size={24} aria-hidden="true" />
        <span className={styles.btnLabel}>跟读</span>
      </button>

      {/* 停止按钮 */}
      {isPlaying && (
        <motion.button
          className={clsx(styles.controlBtn, styles.stopBtn)}
          onClick={onStop}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
        >
          <Square className={styles.btnIcon} size={23} fill="currentColor" aria-hidden="true" />
          <span className={styles.btnLabel}>停止</span>
        </motion.button>
      )}

      {showVoicePicker && (
        <div className={styles.voiceOverlay} role="dialog" aria-modal="true" aria-labelledby="voice-picker-title" onClick={() => setShowVoicePicker(false)}>
          <div className={styles.voiceSheet} onClick={event => event.stopPropagation()}>
            <div className={styles.voiceHeader}>
              <div>
                <span>英语示范音</span>
                <h2 id="voice-picker-title">选择你喜欢的老师声音</h2>
              </div>
              <button type="button" onClick={() => setShowVoicePicker(false)} aria-label="关闭音色选择"><X size={22} /></button>
            </div>
            <p className={styles.currentVoice}>当前使用：<strong>{voiceLabel}</strong></p>
            <div className={styles.voiceList}>
              {voiceChoices.length > 0 ? voiceChoices.map(choice => {
                const selected = choice.name === activeVoiceName;
                return (
                  <div key={choice.name} className={selected ? styles.voiceOptionSelected : styles.voiceOption}>
                    <button type="button" className={styles.selectVoice} onClick={() => onVoiceSelect(choice.name)}>
                      <span className={styles.voiceAvatar}>{choice.label.slice(0, 1).toUpperCase()}</span>
                      <span><strong>{choice.label}</strong><small>{choice.lang} · 清晰自然</small></span>
                      {selected && <Check size={20} aria-label="已选中" />}
                    </button>
                    <button type="button" className={styles.previewVoice} onClick={() => onVoicePreview(choice.name)}>
                      <Volume2 size={17} /> 试听
                    </button>
                  </div>
                );
              }) : <p className={styles.noVoices}>系统正在加载可用音色，请稍后再打开。</p>}
            </div>
            <p className={styles.voiceNote}>声音来自这台设备，实际可选名称会随系统和浏览器不同。</p>
          </div>
        </div>
      )}
    </div>
  );
});

ReaderControls.displayName = 'ReaderControls';

export default ReaderControls;
