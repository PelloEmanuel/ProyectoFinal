@echo off
title Campus - Expo Modo Tunel
echo ====================================================
echo   Campus - Modo Tunel Expo (Bypass de Router)
echo   Usa esto si tu router Wi-Fi bloquea conexiones directas entre dispositivos.
echo ====================================================
echo.
cd /d "%~dp0mobile"
npx expo start --tunnel -c
pause
