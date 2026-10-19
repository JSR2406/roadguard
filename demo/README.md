# RoadGuard demo assets

The accompanying `voiceover-script.md` is a 2–3 minute narration plan for the synthetic dashboard, server workspace, evidence fusion, repair flow, and limitations.

`create_demo_video.py` can generate a narrated submission video when an FFmpeg encoder is installed. It uses clean project-fact slides and a Windows SAPI voice via `pyttsx3`; it is deliberately aligned with the features actually implemented and does not claim trained-model accuracy or road-safety validation.

```powershell
python demo/create_demo_video.py
```
