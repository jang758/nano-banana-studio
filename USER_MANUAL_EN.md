# Nano Banana Studio User Manual

## 1. Install and launch

### One-time installation

1. Install Node.js and Python.
2. Download this repository and extract it.
3. Run these commands in the app folder.

```powershell
npm install
python -m pip install -r requirements.txt
```

### Choose a launcher

- `실행하기.bat`: opens the original one-pass analysis screen.
- `실행하기-새하네스.bat`: opens the new analysis harness.
- `실행하기-비교.bat`: opens the side-by-side comparison screen.

Double-click the launcher you want. Closing the app window also stops the local engine started by that launcher.

## 2. First-time setup

1. Select the Settings button in the upper-right corner.
2. Enter your key under `Gemini API 키`.
3. If needed, select `API 모델 전체 새로고침` to load the models available to that key.
4. Choose an analysis model and an image-generation model.

The API key remains available across all three screens while the app is open. Closing or refreshing the app clears it.

## 3. Analysis screens

Use the top navigation to choose a screen.

### Original analysis

Analyzes one image in one pass and returns detailed specifications plus English and Korean reconstruction prompts.

### New harness

Runs these three stages with the same selected model:

1. Collect visible evidence from the image.
2. Critique contradictions and unsupported precision.
3. Synthesize the final analysis and reconstruction prompt.

### Compare

Runs the original analysis and the new harness with the same image, model, and Agentic Vision setting, then displays the results side by side.

## 4. Settings menu

### Gemini API key

- Use the eye button to show or hide the key.
- `API 모델 전체 새로고침` reloads the models available to the current key.

### Analysis model

Select the model used for image analysis. The intelligence-first default is `gemini-pro-latest`. The app uses the selected model unchanged for every analysis stage, including evidence gathering, critique, and synthesis. It never silently routes a stage to another model.

The following 13 analysis models are available in the default list at startup:

- `gemini-pro-latest`
- `gemini-3.1-pro-preview`
- `gemini-3.7-flash`
- `gemini-3.6-flash`
- `gemini-3.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-3-flash-preview`
- `gemini-3.1-flash-lite`
- `gemini-flash-latest`
- `gemini-flash-lite-latest`
- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

Until an official Gemini Developer API price for `gemini-3.7-flash` is published, its report cost is shown as unavailable.

Each option is labeled by source as `[기본]` (default), `[계정]` (account), or `[Custom]`.

- `[기본]`: the built-in list that remains available before an API lookup.
- `[계정]`: models returned for the current API key after selecting `API 모델 전체 새로고침`. The app reads every Models API page, merges duplicates, and keeps Gemini models that support `generateContent`. Image generation, Veo, TTS, Live/Audio, Embedding, Robotics/Computer Use, Gemma/Lyria, and dedicated Agent families are excluded from the analysis selector.
- `[Custom]`: enter a model name under `Custom Model ID`, then select `추가·선택`. A leading `models/` prefix is removed automatically. If the account cannot use that model, the app displays the API error and does not fall back to another model.

If model discovery fails, the built-in list and existing Custom entries remain available, and the failure reason is displayed in Settings.

### Allow code-based detailed inspection

Allows Agentic Vision. When enabled, the model may run zoom, coordinate, or pixel inspections when needed. The selected analysis model does not change. Check the analysis report to see whether it was actually used and how many inspections ran.

### Image-generation model

Select the model used to generate an image from the extracted prompt.

### Aspect ratio and output size

Choose the generated image's aspect ratio and `1K`, `2K`, or `4K` output size.

### Full model catalog

View selectable analysis models, selectable image-generation models, and specialized models that are not enabled for the current tasks.

## 5. Analyze an image

1. Select a workspace to make it active.
2. Click the `원본 이미지` area to choose a file, drag an image into it, or paste an image from the clipboard.
3. Analysis starts automatically when the image is loaded.
4. When it finishes, the analysis specifications and generation prompts appear and the result is saved automatically to History and result files.

Use the buttons over the source image to enlarge, download, or remove it. `다시 분석` analyzes the current image again with the current settings.

Clipboard paste targets the active workspace. If none is active, the app prefers an empty workspace.

### Automatic result-file storage

After a successful analysis, files accumulate automatically in the `analysis_results` folder at the project root. The app does not create per-run subfolders or ZIP archives for automatic storage.

- `{common-name}.txt`: one UTF-8 file containing the execution report, full analysis, and the original English and Korean extracted prompts.
- `{common-name}_ref.original-extension`: the analyzed image's original bytes, saved without re-encoding.
- Compare mode gives Original Analysis and New Harness separate unique common names.
- A clipboard image without a filename uses the extension associated with its MIME type.
- The relative path is displayed after a successful save. A file-save failure does not discard the completed analysis or prompt; its reason is displayed separately.
- The API key is not included in the automatic-save request or output files.

## 6. Analysis specifications and prompts

### Analysis specifications

- Use `EN` and `KO` to switch between English and Korean analysis.
- Edit the displayed analysis directly when needed.
- Use `복사` to copy the current analysis.

### Generation prompt

- Use `EN` and `KO` to switch between English and Korean prompts.
- Edit the prompt before generating an image.
- Use `프롬프트 복사` to copy the current prompt.
- Use `히스토리 저장` to save the current edited state to History.

Switching languages restores the original analysis result for that language in the editor. Select the language first, then make manual edits.

## 7. Generate an image from the prompt

1. Choose the image-generation model, aspect ratio, and output size in Settings.
2. Review or edit the generation prompt.
3. Select `프롬프트로 이미지 생성`.
4. The generated image appears in the right-hand preview and the History record is updated.

Use the buttons over the generated image to enlarge or download it.

## 8. Workspaces

- Select `새 작업 공간 추가` to add more workspaces.
- Use the trash button in a workspace title bar to close that workspace.
- At least one workspace remains open.
- Closing a workspace does not delete results already saved in History.
- The Original Analysis and New Harness screens keep separate workspace states.

## 9. Compare screen

1. Check the API key and analysis model.
2. Enable `코드 기반 정밀검사 허용` if Agentic Vision is wanted.
3. Add an image by clicking, pasting, or dragging it into the source area.
4. Select `동일 조건 A/B 분석 실행`.

Each side displays its generation prompt, analysis specifications, elapsed time, tokens, estimated cost, and analysis report. Use `EN` or `KO` under `결과 언어` to switch both sides' prompts and analysis specifications together. English is the default. Each successful result is saved separately to History and to `analysis_results` with its own common name.

- If one side fails, use `실패 단계부터 재시도` to rerun only its failed stage and downstream stages. You may select another model first; previously successful stages are not called again.
- Use `비교 리포트 .md 저장` to save both reports in one Markdown file.
- Changing the model clears completed comparison results but preserves a resumable failure checkpoint. Changing Agentic Vision clears both results and checkpoints because it changes the analysis conditions.

## 10. Analysis report

Expand `분석 실행 리포트` in a workspace or comparison result to view:

- completed, failed, or rejected outcome;
- API method and Safety setting;
- selected model and the model version returned by the API;
- whether Agentic Vision was requested and actually used;
- inspection count, area, purpose, and result;
- each stage's duration and every API attempt's model, duration, and outcome;
- input, output, thought, and tool-use tokens;
- total estimated cost and the directly attributed Agentic Vision estimate;
- finish reason, prompt block reason, and failure reason.

Use `리포트 .md 저장` to save the current report as Markdown. Models without a local price entry show an unavailable cost while retaining the token record.

## 11. History

Use the `History` panel on the left to manage saved results. On smaller screens, open it with the History button in the upper-left corner.

- Select a record to load it into an empty workspace or the first workspace.
- Enter prompt or analysis text in the search box and press Enter to search.
- Use a record's trash button to delete that record.
- Use `더 불러오기` to display older records.
- Use `지속 저장 요청` to request persistent local storage from the browser.
- Check current usage and quota in the storage card.
- Use `전체 원본 + 분석 ZIP 내보내기` to export all records.
- `전체 삭제` permanently deletes all History records and stored images after confirmation.

Each ZIP record can include the source and generated images, prompt, analysis text and JSON, report Markdown and JSON, and record metadata.

## 12. Errors and retries

- Temporary network failures, HTTP 408/429/5xx responses, and transient generation stops are retried up to two times after the initial request.
- Automatic retries keep the same model, image, and request settings.
- HTTP 400/401/403 and other non-transient request or authentication failures stop immediately and display the returned reason.
- Original Analysis retries its only analysis stage. The New Harness uses `실패 단계부터 재시도` to keep successful earlier stages and resume at the failed stage.
- Before a New Harness or Compare retry, you may explicitly choose another model. The new selection applies only to the failed and downstream stages; there is no automatic model fallback.
- Failed calls remain in the report with their attempt count, duration, model, returned token usage when available, finish reason, and error reason.
- A result-file or History save failure does not discard a successful analysis; only the persistence failure reason is displayed separately.
- If the selected model does not support Agentic Vision, disable detailed inspection or choose a supporting model and retry.
