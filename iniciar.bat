@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Atualizando dependencias...
python -m pip install -q -U -r requirements.txt
if not exist "web\dist\index.html" (
  echo Compilando a interface pela primeira vez...
  pushd web
  call npm install
  call npm run build
  popd
)
python app.py
pause
