/**
 * MapPage 地图页面
 * 沉浸式横向卷轴地图，按区域展示学习路径
 */

import { useCallback, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Clock3, Crown, Gift, Home, LockKeyhole, Play, Sparkles, Star, Swords, Volume2, X } from 'lucide-react';
import { db } from '@/db';
import { getStoryById } from '@/data';
import {
  generateUnifiedMapData,
  mergeNodeStates,
  type UnifiedMapNode,
} from '@/data/unifiedMap';
import { HorizontalMap, FloatingHeader } from './components';
import styles from './MapPage.module.css';

const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mission = searchParams.get('mission');
  const missionGuide = mission === 'reading'
    ? '选一个喜欢的故事，星星会先读、再陪你跟一句。'
    : mission === 'words'
      ? '选一个故事，星星会从里面找出 3 个魔法单词。'
      : mission === 'roleplay'
        ? '选一个故事场景，你当主角，星星当英语搭档。'
        : mission === 'challenge'
          ? '选一个已经解锁的关卡，完成今天的小挑战。'
          : '先完成一个故事：听一听、说一个词、跟读一句。';
  
  // 地图数据（用于 Header 显示）
  const [nodes, setNodes] = useState<UnifiedMapNode[]>([]);
  
  // 预览状态
  const [selectedNode, setSelectedNode] = useState<UnifiedMapNode | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 加载节点数据
  useEffect(() => {
    const loadNodes = async () => {
      const mapData = generateUnifiedMapData();
      const dbNodes = await db.mapNodes.toArray();
      const mergedNodes = dbNodes.length > 0
        ? mergeNodeStates(mapData.nodes, dbNodes)
        : mapData.nodes;
      setNodes(mergedNodes);
    };
    loadNodes();
  }, []);

  // 节点点击
  const handleNodeClick = useCallback((node: UnifiedMapNode) => {
    setSelectedNode(node);
    setIsPreviewOpen(true);
  }, []);

  // 关闭预览
  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
    setTimeout(() => setSelectedNode(null), 300);
  }, []);

  // 开始节点
  const handleStartNode = useCallback((node: UnifiedMapNode) => {
    handleClosePreview();
    
    if (node.type === 'story' || node.type === 'boss') {
      navigate(`/reader/${node.storyId}${mission ? `?mission=${mission}` : ''}`);
    } else if (node.type === 'challenge' || node.type === 'bonus') {
      navigate(`/quiz/${node.storyId}`);
    }
  }, [navigate, handleClosePreview, mission]);

  return (
    <div className={styles.container}>
      {/* 悬浮顶栏 */}
      <FloatingHeader nodes={nodes} />

      <aside className={styles.companionGuide} aria-label="星星的关卡提示">
        <span className={styles.guideAvatar}><Star size={22} fill="currentColor" /></span>
        <span className={styles.guideCopy}>
          <strong>星星陪你选关</strong>
          <small>{missionGuide}</small>
        </span>
        <button type="button" onClick={() => navigate('/home')}><Home size={18} /> 找星星</button>
      </aside>

      {/* 横向滚动地图 */}
      <main className={styles.mapArea}>
        <HorizontalMap onNodeClick={handleNodeClick} />
      </main>

      {/* 节点预览弹窗 */}
      <AnimatePresence>
        {isPreviewOpen && selectedNode && (
          <NodePreviewModal
            node={selectedNode}
            onClose={handleClosePreview}
            onStart={() => handleStartNode(selectedNode)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// 节点预览弹窗组件
interface NodePreviewModalProps {
  node: UnifiedMapNode;
  onClose: () => void;
  onStart: () => void;
}

const NodePreviewModal: React.FC<NodePreviewModalProps> = ({ node, onClose, onStart }) => {
  const story = node.storyId ? getStoryById(node.storyId) : null;
  const PreviewIcon = node.type === 'boss'
    ? Crown
    : node.type === 'challenge'
      ? Swords
      : node.type === 'bonus'
        ? Gift
        : BookOpen;
  
  // 节点类型标签
  const typeLabels: Record<string, { label: string; color: string }> = {
    story: { label: '故事', color: '#6B5CE7' },
    boss: { label: 'Boss 关卡', color: '#F59E0B' },
    challenge: { label: '挑战', color: '#EF4444' },
    bonus: { label: '奖励关卡', color: '#10B981' },
  };
  
  const typeInfo = typeLabels[node.type] || typeLabels.story;

  // 区域名称映射
  const themeNames: Record<string, string> = {
    forest: '萌芽之森',
    valley: '回声山谷',
    ocean: '深海秘境',
    cloud: '云端城堡',
    stars: '星空迷宫',
    time: '时光长廊',
    core: '魔力核心',
  };

  return (
    <motion.div
      className={styles.previewOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={styles.previewCard}
        initial={{ y: 100, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 100, opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button className={styles.previewClose} onClick={onClose} aria-label="关闭关卡介绍">
          <X size={21} />
        </button>

        {/* 节点图标 */}
        <div 
          className={styles.previewIcon}
          style={{ '--icon-color': typeInfo.color } as React.CSSProperties}
        >
          <PreviewIcon size={43} strokeWidth={2.2} aria-hidden="true" />
        </div>

        {/* 类型标签 */}
        <span 
          className={styles.previewType}
          style={{ backgroundColor: typeInfo.color }}
        >
          {typeInfo.label}
        </span>

        {/* 标题 */}
        <h2 className={styles.previewTitle}>{node.titleCn}</h2>
        <p className={styles.previewSubtitle}>{node.title}</p>

        <div className={styles.lessonPromise}>
          <span><Volume2 size={17} /> 听故事</span>
          <span><Sparkles size={17} /> 认新词</span>
          <span><BookOpen size={17} /> 跟读一句</span>
        </div>

        {/* 故事信息 */}
        {story && (
          <div className={styles.previewMeta}>
            <div className={styles.previewMetaItem}>
              <BookOpen size={17} />
              <span>{story.metadata.wordCount} 词</span>
            </div>
            <div className={styles.previewMetaItem}>
              <Clock3 size={17} />
              <span>约 {story.metadata.estimatedTime} 分钟</span>
            </div>
            <div className={styles.previewMetaItem}>
              <Sparkles size={17} />
              <span>+{node.rewards.magicPower} 魔力</span>
            </div>
          </div>
        )}

        {/* 级别信息 */}
        <div className={styles.previewLevel}>
          Level {node.level} · {themeNames[node.theme] || node.theme}
        </div>

        {/* 操作按钮 */}
        <div className={styles.previewActions}>
          {node.completed ? (
            <motion.button 
              className={`${styles.previewBtn} ${styles.previewBtnSecondary}`}
              onClick={onStart}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              再次挑战
            </motion.button>
          ) : node.unlocked ? (
            <motion.button 
              className={`${styles.previewBtn} ${styles.previewBtnPrimary}`}
              onClick={onStart}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Play size={19} fill="currentColor" /> 开始学习
            </motion.button>
          ) : (
            <button className={`${styles.previewBtn} ${styles.previewBtnDisabled}`} disabled>
              <LockKeyhole size={18} /> 未解锁
            </button>
          )}
        </div>

        {/* 解锁提示 */}
        {!node.unlocked && (
          <p className={styles.previewHint}>
            完成前置关卡后解锁
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};

export default MapPage;
