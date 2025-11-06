# 录音占位卡：微型电平指示器（风格 b）实施计划

目标：在 RecordingPlaceholderCard 的状态/时长右侧增加一个微型波形电平指示器，用以确认麦克风在工作，并保持与主题一致的简约配色。

实现要点：
- 位置与尺寸：Header 内 Duration 右侧，约 120×14 px；pointer-events: none；轻微降低不透明度。
- 显示策略：仅 "recording"/"paused" 时显示；暂停时冻结最后一帧并弱化配色；其余状态隐藏。
- 刷新频率：约 10 FPS（100ms interval），避免高频重绘。
- 技术：复用 AudioRecorderStore 的 WebAudio AnalyserNode，取频域数据（getByteFrequencyData）供 AudioWaveform 渲染。
- 作用范围：仅影响 RecordingPlaceholderCard 和 Store 初始化，不改动 GlobalRecorderController，不涉及 i18n 变更。

文件改动：
- app/stores/AudioRecorderStore.ts
  - 在 startRecording 获取到 MediaStream 后调用 setupAudioAnalysis(stream)，初始化 audioContext/analyser。
- app/components/RecordingPlaceholderCard.tsx
  - 引入 AudioWaveform，维护 waveformData，本地以 10 FPS 从 analyser 拉取频谱数据；
  - 在 Header（Duration 右侧）渲染微型波形；paused 冻结并弱化配色。

验收标准：
- 录音中：微型波形以约 10 FPS 动画反映输入幅度；静默时低，讲话时升高。
- 暂停：波形停止变化并弱化配色；恢复录音继续动画。
- 非录音/暂停状态：不显示电平指示器。
- 仅活跃录音的占位卡显示电平；历史占位不显示。
- 页面导航往返后，若录音仍在进行，返回源文档时电平正常显示。
- 无类型/构建错误；不影响全局浮窗 UI。
