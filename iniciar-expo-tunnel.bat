@echo off
title SkillTrack - Expo Modo Tunel
echo ====================================================
echo   SkillTrack - Modo Tunel Expo (Bypass de Router)
echo   Usa esto si tu router Wi-Fi bloquea conexiones directas entre dispositivos.
echo ====================================================
echo.
cd /d "%~dp0mobile"
npx expo start --tunnel -c
pause
