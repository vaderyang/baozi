# File Preview Feature

This document describes the file preview feature that allows users to preview Office documents (Word, PowerPoint, Excel) and PDFs directly within the editor without downloading them.

## Overview

The file preview feature uses **LibreOffice** on the server-side to convert documents to PDF format, which is then displayed in a modal window. This provides a seamless preview experience for supported file types.

## Supported File Formats

- **Word Documents**: `.docx`, `.doc`
- **PowerPoint Presentations**: `.pptx`, `.ppt`
- **Excel Spreadsheets**: `.xlsx`, `.xls`
- **PDF Documents**: `.pdf` (no conversion needed)

## Architecture

### Backend Components

1. **LibreOfficeConverter** (`server/utils/LibreOfficeConverter.ts`)
   - Handles document conversion to PDF using LibreOffice
   - Manages temporary file creation and cleanup
   - Validates supported file formats
   - Downloads attachments for conversion

2. **Preview API Endpoint** (`server/routes/api/attachments/attachments.ts`)
   - Route: `POST /api/attachments.preview`
   - Validates user authorization
   - Checks if LibreOffice is available
   - Converts documents to PDF
   - Streams PDF back to the client
   - Rate limited to 10 requests per minute per user

3. **Environment Configuration** (`server/env.ts`)
   - `FILE_PREVIEW_ENABLED`: Enable/disable the feature (default: false)
   - `LIBREOFFICE_CONVERSION_TIMEOUT_MS`: Timeout for conversions (default: 30000ms)

### Frontend Components

1. **AttachmentPreviewModal** (`app/components/AttachmentPreviewModal.tsx`)
   - Modal component that displays the PDF preview
   - Handles loading states and error display
   - Uses iframe to render the PDF with built-in browser PDF viewer
   - Automatically cleans up blob URLs on unmount

2. **useAttachmentPreview Hook** (`app/hooks/useAttachmentPreview.ts`)
   - React hook that listens for preview events
   - Manages modal open/close state
   - Coordinates between editor commands and modal display

3. **Preview Button** (`app/editor/menus/attachment.tsx`)
   - Adds an eye icon button to the attachment floating toolbar
   - Only shown for supported file types
   - Only visible when `FILE_PREVIEW_ENABLED` is true

4. **Editor Command** (`shared/editor/nodes/Attachment.tsx`)
   - `previewAttachment` command triggers the preview
   - Extracts attachment ID from the node
   - Dispatches custom event to open preview modal

## Installation & Configuration

### 1. Install LibreOffice

The feature requires LibreOffice to be installed on the server.

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y libreoffice
```

**CentOS/RHEL:**
```bash
sudo yum install -y libreoffice
```

**macOS:**
```bash
brew install --cask libreoffice
```

**Docker:**
Add to your Dockerfile:
```dockerfile
RUN apt-get update && \
    apt-get install -y libreoffice && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

### 2. Enable the Feature

Add to your `.env` file:

```bash
# Enable file preview feature
FILE_PREVIEW_ENABLED=true

# Optional: Adjust conversion timeout (default: 30000ms / 30 seconds)
LIBREOFFICE_CONVERSION_TIMEOUT_MS=30000
```

### 3. Verify Installation

The system will automatically check if LibreOffice is available when you try to preview a file. If it's not installed, users will see an error message.

You can verify manually:
```bash
libreoffice --version
```

## Usage

### For Users

1. **Upload a supported document** (Word, PowerPoint, Excel, or PDF) to your document
2. **Select the attachment** by clicking on it in the editor
3. **Click the eye icon** in the floating toolbar that appears
4. **View the preview** in the modal window
5. **Close the modal** by clicking the X button or clicking outside the modal

### For Developers

#### Triggering Preview Programmatically

```typescript
// Get the editor instance
const { view } = editor;

// Execute the preview command
view.state.commands.previewAttachment();
```

#### Checking if Preview is Available

```typescript
import LibreOfficeConverter from "@server/utils/LibreOfficeConverter";

// Check if LibreOffice is installed
const isAvailable = await LibreOfficeConverter.isAvailable();

// Check if a file is supported
const isSupported = LibreOfficeConverter.isSupportedFormat(
  "document.docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
);
```

## Security Considerations

1. **Authorization**: The API endpoint checks that users can only preview attachments from their own team
2. **Rate Limiting**: Preview requests are limited to 10 per minute per user to prevent abuse
3. **Temporary Files**: All temporary files are cleaned up after conversion
4. **Input Validation**: File types and sizes are validated before processing
5. **Timeout Protection**: Conversions have a configurable timeout to prevent hanging processes

## Performance Considerations

### Conversion Times

Typical conversion times vary by file size and complexity:
- Simple documents (< 1MB): 2-5 seconds
- Medium documents (1-5MB): 5-10 seconds
- Large documents (> 5MB): 10-30 seconds

### Resource Usage

- **CPU**: LibreOffice conversion is CPU-intensive
- **Memory**: Requires ~200-500MB RAM per concurrent conversion
- **Disk**: Temporary files are created during conversion
- **Recommendation**: For production, consider:
  - Running conversions on a separate worker server
  - Implementing caching for frequently previewed files
  - Setting appropriate rate limits

### Scaling Considerations

For high-traffic deployments:

1. **Use a dedicated conversion service**:
   - Separate the conversion workload to dedicated servers
   - Use a queue system (Bull/Redis) for conversion jobs
   - Implement result caching with TTL

2. **Add caching**:
   - Cache converted PDFs using file hash as key
   - Store in Redis or file storage with TTL
   - Serve cached previews instantly

3. **Alternative approaches**:
   - Use a cloud-based conversion service (e.g., CloudConvert, Zamzar API)
   - Pre-convert files during upload (async)
   - Use client-side preview for PDF files only

## Troubleshooting

### Preview button not showing

1. Check that `FILE_PREVIEW_ENABLED=true` in your `.env`
2. Verify the file type is supported
3. Check browser console for errors

### "LibreOffice is not installed" error

1. Install LibreOffice on the server (see Installation section)
2. Verify installation: `libreoffice --version`
3. Restart the application server
4. Check server logs for errors

### Preview fails or hangs

1. Check server logs for LibreOffice errors
2. Verify the file is not corrupted
3. Check that the timeout is sufficient (`LIBREOFFICE_CONVERSION_TIMEOUT_MS`)
4. Ensure sufficient disk space for temporary files
5. Check server has enough memory

### Slow preview generation

1. Increase `LIBREOFFICE_CONVERSION_TIMEOUT_MS` if needed
2. Consider file size - large files take longer
3. Check server CPU and memory usage
4. Consider implementing caching (see Performance section)

## Future Enhancements

Possible improvements for future versions:

1. **Caching**: Cache converted PDFs to avoid re-conversion
2. **Async Processing**: Convert files asynchronously during upload
3. **Progress Indicators**: Show conversion progress for large files
4. **Alternative Viewers**: Use specialized viewers (e.g., PDF.js, DocX.js)
5. **Thumbnail Generation**: Generate thumbnails for file listings
6. **Direct Editing**: Preview with edit capabilities
7. **Collaborative Viewing**: Share preview links with annotations

## API Reference

### POST /api/attachments.preview

Preview an attachment by converting it to PDF.

**Request Body:**
```json
{
  "id": "attachment-uuid"
}
```

**Response:**
- `Content-Type: application/pdf`
- Binary PDF data

**Error Responses:**
- `400`: File type not supported
- `401`: Unauthorized
- `404`: Attachment not found
- `500`: Conversion failed

**Rate Limit:** 10 requests per minute per user

## Testing

Manual testing checklist:

- [ ] Preview Word document (.docx)
- [ ] Preview old Word document (.doc)
- [ ] Preview PowerPoint (.pptx)
- [ ] Preview old PowerPoint (.ppt)
- [ ] Preview Excel workbook (.xlsx)
- [ ] Preview old Excel workbook (.xls)
- [ ] Preview PDF (should display without conversion)
- [ ] Test with large files (> 5MB)
- [ ] Test with corrupted files (should show error)
- [ ] Test rate limiting (make > 10 requests quickly)
- [ ] Test without LibreOffice installed (should show error)
- [ ] Test with disabled feature (button should not appear)

## License

This feature is part of the Outline project and follows the same license.
