# Requirements Document

## Introduction

本功能将录音/音频转写作为应用的核心入口，重新设计用户体验。用户不再需要先创建文档再添加音频，而是直接从录音开始，系统自动创建文档并通过AI建议归档位置。核心理念是"录音优先于文档" - 每个用户拥有一个私有的录音收件箱（Audio Inbox），所有录音自动在此创建新文档，转写完成后AI分析内容并建议归档到合适的Collection/文档位置。

## Glossary

- **Audio Hub**: 音频中心首页，为音频工作流优化的入口页面，提供录音、上传、URL导入三种方式
- **Audio Inbox**: 录音收件箱，每个用户的私有Collection，所有新录音默认在此创建文档
- **Recording Studio**: 录音工作室界面，专门为录音设计的全屏界面，显示音轨、实时转录、对话人等
- **Global Recording Control**: 全局录音控制器，在用户导航到其他页面时持续显示录音状态
- **AI Archive Suggestion**: AI归档建议，转写完成后AI分析内容并建议将录音归档到的Collection/文档位置
- **Audio Document**: 音频文档，由录音自动创建的文档，初始位于Audio Inbox中
- **Recording Session**: 录音会话，从开始录音到停止的完整过程
- **Real-time Transcription**: 实时转录，录音过程中同步显示的文字转录
- **URL Import**: URL导入，从YouTube、播客、视频链接等提取音频并转写
- **Batch Upload**: 批量上传，一次上传多个音频文件并自动处理

## Requirements

### Requirement 1

**User Story:** 作为用户，我希望打开应用后看到一个专门为音频工作流优化的首页，这样我就能立即选择录音、上传文件或导入URL

#### Acceptance Criteria

1. WHEN a user first logs in or has no recent documents, THE system SHALL display the Audio Hub as the default landing page
2. THE Audio Hub SHALL display a prominent heading "Capture Audio, Create Knowledge" or similar value proposition
3. THE Audio Hub SHALL provide three primary input methods in a visually balanced layout: "Record Audio", "Upload Files", "Import from URL"
4. THE "Record Audio" option SHALL display a large microphone icon and description "Start recording now"
5. THE "Upload Files" option SHALL display a file upload icon and description "Upload audio or video files"
6. THE "Import from URL" option SHALL display a link icon and description "YouTube, podcasts, or any video URL"
7. THE Audio Hub SHALL be accessible via a navigation menu item labeled "Audio Hub" with a microphone icon
8. THE Audio Hub SHALL display a "Recent Recordings" section showing the last 5 Audio Documents from the Audio Inbox
9. WHERE the user has active transcription jobs, THE Audio Hub SHALL display a "Processing" section with progress indicators
10. THE Audio Hub SHALL provide a quick link to view the full Audio Inbox Collection

### Requirement 1.1

**User Story:** 作为用户，我希望从Audio Hub点击"Record Audio"能够快速开始录音

#### Acceptance Criteria

1. WHEN the user clicks "Record Audio" on the Audio Hub, THE system SHALL check if an Audio Inbox Collection exists for the user
2. IF the Audio Inbox Collection does not exist, THEN THE system SHALL automatically create a private Collection named "Audio Inbox" or localized equivalent
3. WHEN the user clicks "Record Audio", THE system SHALL create a new Audio Document in the Audio Inbox Collection with a temporary title "Recording {timestamp}"
4. WHEN the Audio Document is created, THE system SHALL open the Recording Studio interface
5. THE Recording Studio SHALL request microphone permission if not already granted
6. WHEN microphone permission is granted, THE Recording Studio SHALL immediately start recording
7. IF microphone permission is denied, THEN THE system SHALL display an error message and close the Recording Studio

### Requirement 2

**User Story:** 作为用户，我希望在专门的录音界面中看到音轨可视化和录音控制，这样我就能专注于录音本身

#### Acceptance Criteria

1. THE Recording Studio SHALL display as a large/dedicate interface that replaces the document editor
2. THE Recording Studio SHALL display a large, prominent waveform visualization showing real-time audio levels
3. THE Recording Studio SHALL display the current recording duration in MM:SS format, updated every second
4. THE Recording Studio SHALL provide clearly visible control buttons: "Pause", "Stop", "Cancel"
5. WHEN the user clicks "Pause", THE Recording Studio SHALL pause audio capture and change the button to "Resume"
6. WHEN the user clicks "Resume", THE Recording Studio SHALL continue audio capture
7. WHEN the user clicks "Stop", THE Recording Studio SHALL stop recording and begin the transcription process
8. WHEN the user clicks "Cancel", THE Recording Studio SHALL discard the recording, delete the Audio Document, and return to the previous view
9. THE Recording Studio SHALL display a visual indicator (pulsing red dot or similar) showing that recording is active
10. THE Recording Studio SHALL use a clean, distraction-free design focused on the recording experience

### Requirement 3

**User Story:** 作为用户，我希望在录音时能够导航到其他文档查看内容，同时录音继续进行

#### Acceptance Criteria

1. THE Recording Studio SHALL provide a "Minimize" or "Browse Documents" button
2. WHEN the user clicks "Minimize" or navigates away from the Recording Studio, THE Recording Studio SHALL close
3. WHEN the Recording Studio closes during active recording, THE Global Recording Control SHALL appear
4. THE Global Recording Control SHALL be a floating, always-visible UI element (e.g., bottom-right corner)
5. THE Global Recording Control SHALL display: recording status icon, current duration, and a clickable area
6. WHEN the user clicks the Global Recording Control, THE system SHALL reopen the Recording Studio interface
7. WHEN the Recording Studio reopens, THE system SHALL display the current recording state with updated duration and waveform
8. THE Global Recording Control SHALL remain visible across all pages and document views
9. THE Global Recording Control SHALL provide a "Stop" action (e.g., on hover or right-click)
10. WHEN recording stops from any location, THE Global Recording Control SHALL disappear

### Requirement 4

**User Story:** 作为用户，我希望录音停止后自动开始转写，并在转写完成后看到完整的文本内容

#### Acceptance Criteria

1. WHEN the user stops recording, THE system SHALL save the audio file as an Attachment
2. WHEN the audio file is saved, THE system SHALL create a TranscriptionJob with sourceType 'recording'
3. THE Recording Studio SHALL transition to a "Processing" view showing "Transcribing your recording..."
4. THE Processing view SHALL display an animated progress indicator
5. THE Processing view SHALL allow the user to close the view and return later
6. WHEN transcription completes, THE system SHALL insert the transcribed text into the Audio Document
7. THE transcribed text SHALL be formatted with a "## Transcript" heading followed by the text content
8. WHEN transcription completes and the user is viewing the Audio Document, THE system SHALL automatically refresh to show the transcript
9. IF transcription fails, THEN THE system SHALL display an error message with a "Retry" button in the Audio Document
10. THE Audio Document SHALL remain in the Audio Inbox Collection until the user moves it

### Requirement 5

**User Story:** 作为用户，我希望转写完成后AI能够分析内容并建议我将这个录音归档到哪里，这样我就不需要手动整理

#### Acceptance Criteria

1. WHEN transcription completes successfully, THE system SHALL trigger an AI analysis of the transcript content
2. THE AI analysis SHALL identify: main topics, key entities, suggested document type (meeting, interview, note, etc.)
3. THE AI analysis SHALL search the user's existing Collections and Documents for relevant matches
4. THE system SHALL display an "AI Archive Suggestion" card at the top of the Audio Document
5. THE AI Archive Suggestion card SHALL provide up to 3 suggestions with explanations, such as: "Move to Collection 'Project X' because this discusses the Q4 roadmap"
6. THE AI Archive Suggestion card SHALL provide options: "Move Here", "Create New Collection", "Keep in Inbox", "Dismiss"
7. WHEN the user clicks "Move Here" on a suggestion, THE system SHALL move the Audio Document to the suggested Collection or as a child of the suggested Document
8. WHEN the user clicks "Create New Collection", THE system SHALL prompt for a collection name and move the document there
9. WHEN the user clicks "Keep in Inbox", THE system SHALL dismiss the suggestion card
10. WHEN the user clicks "Dismiss", THE system SHALL hide the suggestion card but keep the document in Audio Inbox
11. THE AI Archive Suggestion SHALL be stored in the Audio Document metadata so it can be reviewed later
12. IF AI analysis fails or finds no good suggestions, THEN THE system SHALL display a simple "Keep in Inbox or move manually" message

### Requirement 6

**User Story:** 作为用户，我希望Audio Inbox能够清晰展示所有未归档的录音，这样我就能定期整理它们

#### Acceptance Criteria

1. THE Audio Inbox Collection SHALL be accessible from the main navigation or Collections list
2. THE Audio Inbox Collection SHALL display a special icon (e.g., inbox icon) to distinguish it from regular Collections
3. THE Audio Inbox Collection SHALL display documents in reverse chronological order (newest first)
4. THE Audio Inbox document list SHALL show for each document: title, recording date, duration, transcription status
5. THE Audio Inbox document list SHALL use a compact card layout optimized for audio content
6. THE Audio Inbox SHALL display a count badge showing the number of unarchived recordings
7. WHEN a document is moved out of Audio Inbox, THE count badge SHALL update automatically
8. THE Audio Inbox SHALL provide a bulk action: "Select Multiple" to move several recordings at once
9. THE Audio Inbox SHALL NOT emphasize standard editing features (formatting toolbar, etc.) - focus on audio content
10. WHEN the user opens an Audio Document from the Inbox, THE system SHALL display the transcript in a read-optimized format

### Requirement 7

**User Story:** 作为用户，我希望能够为录音添加标题和简短描述，这样我就能更容易识别和搜索它们

#### Acceptance Criteria

1. THE Recording Studio SHALL provide an optional "Title" input field at the top
2. THE Title input field SHALL have placeholder text "Untitled Recording" or similar
3. WHEN the user enters a title during recording, THE system SHALL update the Audio Document title in real-time
4. WHEN the user stops recording without entering a title, THE system SHALL keep the default "Recording {timestamp}" title
5. AFTER transcription completes, THE AI Archive Suggestion SHALL optionally suggest a better title based on content
6. THE Audio Document view SHALL allow editing the title inline
7. THE Audio Document view SHALL provide a "Description" field for optional notes
8. THE Description field SHALL be saved automatically as the user types



### Requirement 8

**User Story:** 作为用户，我希望Recording Studio能够显示实时转录，这样我就能在录音时看到文字内容

#### Acceptance Criteria

1. WHERE the transcription service supports streaming/real-time transcription, THE Recording Studio SHALL display a "Real-time Transcription" panel
2. THE Real-time Transcription panel SHALL be positioned below the waveform visualization
3. THE Real-time Transcription panel SHALL display transcribed text as it becomes available during recording
4. THE Real-time Transcription SHALL update with a smooth scrolling animation as new text appears
5. THE Real-time Transcription SHALL display the most recent 10-20 seconds of transcribed text
6. WHERE real-time transcription is not available, THE Recording Studio SHALL hide this panel
7. THE Real-time Transcription SHALL be marked as "Preview" or "Draft" to indicate it may not be final
8. WHEN recording stops, THE system SHALL perform a full transcription pass for accuracy

### Requirement 9

**User Story:** 作为用户，我希望能够在录音过程中标记重要时刻，这样我就能快速回顾关键内容，同时AI纪要也可以利用这些时刻的信息进行更准确的撰写。

#### Acceptance Criteria

1. THE Recording Studio SHALL provide a "Mark" or "Flag" button
2. WHEN the user clicks "Mark", THE system SHALL record the current timestamp
3. THE system SHALL store markers in the TranscriptionJob metadata as an array of timestamps with optional labels
4. AFTER transcription completes, THE system SHALL display markers as annotations in the transcript
5. THE markers SHALL be displayed as inline badges or highlights at the corresponding text positions
6. THE Audio Document view SHALL provide a "Jump to Marker" navigation feature
7. WHEN the user clicks a marker, THE system SHALL scroll to the corresponding position in the transcript

### Requirement 10

**User Story:** 作为用户，我希望能够从Audio Inbox快速开始新的录音，这样我就能保持在录音工作流中

#### Acceptance Criteria

1. THE Audio Inbox Collection view SHALL display a prominent "New Recording" button at the top
2. WHEN the user clicks "New Recording" from Audio Inbox, THE system SHALL immediately open the Recording Studio
3. THE Audio Inbox SHALL provide keyboard shortcut (e.g., "R" or "Cmd+R") to start a new recording
4. THE main navigation "Record" button SHALL be accessible from any page with a consistent keyboard shortcut
5. WHEN a recording is in progress and the user tries to start a new recording, THE system SHALL display a warning "Recording already in progress"

### Requirement 11

**User Story:** 作为用户，我希望系统能够在录音过程中自动保存进度，这样即使浏览器崩溃我也不会丢失录音

#### Acceptance Criteria

1. THE Recording Studio SHALL save audio chunks to browser IndexedDB every 10 seconds during recording
2. WHEN the browser crashes or closes unexpectedly during recording, THE system SHALL preserve audio chunks in IndexedDB
3. WHEN the user returns to the application after a crash, THE system SHALL detect incomplete recordings in IndexedDB
4. THE system SHALL display a notification "Recover incomplete recording from {time}?" with "Recover" and "Discard" options
5. WHEN the user clicks "Recover", THE system SHALL reconstruct the audio file from saved chunks and resume the transcription process
6. WHEN the user clicks "Discard", THE system SHALL delete the saved chunks from IndexedDB
7. THE system SHALL automatically clean up IndexedDB chunks older than 7 days

### Requirement 12

**User Story:** 作为用户，我希望能够在Audio Inbox中过滤和搜索录音，这样我就能快速找到特定的内容

#### Acceptance Criteria

1. THE Audio Inbox SHALL provide a search input field at the top
2. THE search SHALL match against: document title, transcript content, AI-suggested topics
3. THE Audio Inbox SHALL provide filter options: "All", "Transcribing", "Ready to Archive", "Archived"
4. THE "Ready to Archive" filter SHALL show documents with completed transcriptions and AI suggestions
5. THE Audio Inbox SHALL provide sort options: "Newest First", "Oldest First", "Longest Duration", "Shortest Duration"
6. THE search and filter state SHALL be preserved when the user navigates away and returns

### Requirement 13

**User Story:** 作为用户，我希望Recording Studio界面能够适配移动设备，这样我就能在手机上录音

#### Acceptance Criteria

1. THE Recording Studio SHALL use responsive design that adapts to screen sizes from 320px to 1920px width
2. WHEN viewed on mobile (< 768px width), THE Recording Studio SHALL stack controls vertically
3. WHEN viewed on mobile, THE waveform visualization SHALL be optimized for smaller screens
4. THE Recording Studio SHALL support touch gestures for pause/resume actions
5. THE Global Recording Control SHALL be positioned appropriately for mobile (e.g., bottom center)
6. THE Recording Studio SHALL prevent screen sleep during active recording on mobile devices

### Requirement 14

**User Story:** 作为用户，我希望能够从Audio Hub上传单个或多个音频/视频文件，系统自动处理转写和归档建议

#### Acceptance Criteria

1. WHEN the user clicks "Upload Files" on the Audio Hub, THE system SHALL open a file picker
2. THE file picker SHALL support selecting multiple files simultaneously
3. THE system SHALL support audio file formats: mp3, wav, m4a, webm, ogg, flac
4. THE system SHALL support video file formats: mp4, mov, avi, mkv (extract audio automatically)
5. WHEN files are selected, THE system SHALL display an upload queue showing all selected files
6. THE upload queue SHALL display for each file: filename, file size, format, status
7. WHEN upload starts, THE system SHALL create an Audio Document in the Audio Inbox for each file
8. THE system SHALL set the Audio Document title to the filename (without extension)
9. THE system SHALL create a TranscriptionJob with sourceType 'upload' for each file
10. THE system SHALL process files sequentially with a concurrency limit of 3 simultaneous transcriptions
11. THE upload queue SHALL display status for each file: "Uploading", "Extracting Audio" (for video), "Transcribing", "Completed", "Failed"
12. WHEN a file upload fails, THE upload queue SHALL display an error message and a "Retry" button
13. WHEN all files complete, THE system SHALL display a summary notification "X files transcribed successfully"
14. WHEN transcription completes for each file, THE system SHALL trigger AI Archive Suggestion
15. THE Audio Hub SHALL support drag-and-drop for audio and video files anywhere on the page
16. WHEN files are dragged over the Audio Hub, THE system SHALL display a drop zone overlay "Drop files to transcribe"

### Requirement 15

**User Story:** 作为用户，我希望能够从Audio Hub粘贴YouTube或播客URL，系统自动提取音频并转写

#### Acceptance Criteria

1. WHEN the user clicks "Import from URL" on the Audio Hub, THE system SHALL display a URL input dialog
2. THE URL input dialog SHALL provide a text input field with placeholder "Paste YouTube, podcast, or video URL"
3. THE URL input dialog SHALL provide example URLs below the input field
4. THE system SHALL support URLs from: YouTube, Vimeo, podcast RSS feeds, direct audio/video file URLs
5. WHEN the user pastes a URL and clicks "Import", THE system SHALL validate the URL format
6. THE system SHALL extract metadata from the URL: title, duration, thumbnail (if available)
7. THE system SHALL display a preview card showing: extracted title, duration, thumbnail, source platform
8. THE preview card SHALL provide a "Confirm Import" button
9. WHEN the user clicks "Confirm Import", THE system SHALL create an Audio Document in the Audio Inbox
10. THE system SHALL set the Audio Document title to the extracted title or URL if title unavailable
11. THE system SHALL create a TranscriptionJob with sourceType 'url' and store the original URL in metadata
12. THE system SHALL download/extract audio from the URL in the background
13. THE system SHALL display status: "Downloading", "Extracting Audio", "Transcribing", "Completed", "Failed"
14. IF URL extraction fails, THEN THE system SHALL display an error message "Unable to extract audio from this URL" with details
15. WHEN transcription completes, THE system SHALL trigger AI Archive Suggestion
16. THE URL input dialog SHALL support pasting multiple URLs (one per line) for batch import
17. WHEN multiple URLs are provided, THE system SHALL process them sequentially with the same concurrency limit as file uploads

### Requirement 16

**User Story:** 作为用户，我希望在Audio Hub看到所有正在处理的音频任务，这样我就能追踪进度

#### Acceptance Criteria

1. THE Audio Hub SHALL display a "Processing" section when there are active transcription jobs
2. THE "Processing" section SHALL show all jobs with status: "Uploading", "Downloading", "Transcribing"
3. THE "Processing" section SHALL display for each job: title/filename, source type icon (microphone/file/link), progress indicator, elapsed time
4. THE "Processing" section SHALL update in real-time via WebSocket events
5. THE "Processing" section SHALL provide a "Cancel" button for each job in "Uploading" or "Downloading" status
6. WHEN a job completes, THE system SHALL move it from "Processing" to "Recent Recordings" section
7. WHEN a job fails, THE "Processing" section SHALL display the error and a "Retry" button
8. THE "Processing" section SHALL display a summary: "Processing X items"
9. THE "Processing" section SHALL be collapsible to save screen space
8. THE Audio Inbox SHALL support drag-and-drop for audio files
