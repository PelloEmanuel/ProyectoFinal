@echo off
title Campus - Servidor Expo Mobile
echo ====================================================
echo   Campus - Iniciando Expo en tu Red Wi-Fi
echo ====================================================

:: 1. Asegurar que Windows trate la conexion Wi-Fi como Red Privada (para no bloquear el puerto 8081)
powershell -Command "Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private -ErrorAction SilentlyContinue" >nul 2>&1

:: 2. Detectar la IP local IPv4 excluyendo adapters VPN virtuales (Radmin 26.x.x.x)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "26."') do (
    set IP=%%a
    goto :found_ip
)

:found_ip
set IP=%IP: =%
echo [OK] IP de Wi-Fi detectada: %IP%
echo [OK] Puerto Metro: 8081
echo [OK] Puerto Backend: 3000
echo.
echo Abri Expo Go en tu celular (conectado al mismo Wi-Fi: Juanma)
echo y escanea el codigo QR o ingresa: exp://%IP%:8081
echo ====================================================
echo.

set REACT_NATIVE_PACKAGER_HOSTNAME=%IP%
cd /d "%~dp0mobile"
npx expo start --lan -c
pause
