// Kit do App (histórias 1.8 e 1.9). Telas importam daqui; ver README.md.
export { STATE_LABEL, withState } from './a11y';
export { AlexAvatar, type AlexAvatarProps } from './AlexAvatar';
export { Alex, AlexWave, type AlexProps } from './art/Alex';
export { ALEX_POSES, type AlexPose } from './art/alexSvg';
export { Room } from './art/Room';
export { Button, BUTTON_VARIANTS, type ButtonProps, type ButtonVariant } from './Button';
export { Card, CARD_TONES, type CardProps, type CardTone } from './Card';
export { CHOICE_LETTERS, ChoiceCard, choiceLetter, type ChoiceCardProps, type ChoiceState } from './ChoiceCard';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Column } from './Column';
export { CONFETTI_PIECES, Confetti } from './Confetti';
export { EXPRESSION_EYEBROW, ExpressionCard, type ExpressionCardProps, type ExpressionEntry } from './ExpressionCard';
export {
  EXPRESSION_CLOSE_LABEL,
  EXPRESSION_SCRIM_LABEL,
  ExpressionSheet,
  type ExpressionSheetProps,
} from './ExpressionSheet';
export {
  EXPECTED_LABEL,
  FEEDBACK_TITLES,
  FEEDBACK_TONES,
  FeedbackSheet,
  resultLine,
  WRONG_MESSAGE,
  type FeedbackAction,
  type FeedbackSheetProps,
  type FeedbackTone,
} from './FeedbackSheet';
export {
  GAP_FIELD_WIDTH,
  GAP_MIN_WIDTH,
  GAP_STATES,
  GapSlot,
  gapLabel,
  type GapSlotProps,
  type GapState,
} from './GapSlot';
export { Icon, type IconName } from './icons';
export { Logo } from './Logo';
export { MATCH_LINKED, MATCH_STATES, MatchCard, type MatchCardProps, type MatchState } from './MatchCard';
export {
  MIC_IDLE_CAPTION,
  MIC_LABEL,
  MIC_LISTENING_CAPTION,
  MIC_STOP_LABEL,
  MIC_UNAVAILABLE_CAPTION,
  MicButton,
  type MicButtonProps,
} from './MicButton';
export { MODE_TAGS, ModeTag, type ModeTagLabel } from './ModeTag';
export { NoticeSheet, type NoticeSheetProps } from './NoticeSheet';
export { motion, useReducedMotion } from './motion';
export { edgeStyle, Pressable3D, touchSlop, type Pressable3DProps } from './Pressable3D';
export { clampProgress, ProgressBar } from './ProgressBar';
export { SheetModal, type SheetModalProps } from './SheetModal';
export { SceneFrame, sceneHeight, type SceneFrameProps } from './SceneFrame';
export { SpeechBubble, type SpeechBubbleProps, type SpeechBubbleTail } from './SpeechBubble';
export { STATUS_BANNER_TONES, StatusBanner, type StatusBannerProps, type StatusBannerTone } from './StatusBanner';
export { TextLink, type TextLinkProps } from './TextLink';
export { FOCUS_RING, TextField, type TextFieldProps } from './TextField';
export { WORD_CHIP_STATES, WordChip, type WordChipProps, type WordChipState } from './WordChip';
export { XpChip, XpChipLight, xpGainLabel, xpLabel } from './XpChip';
