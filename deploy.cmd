@echo off
setlocal

echo.
echo Loading environments from .env file
for /f "usebackq tokens=*" %%i in (`powershell -Command "Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)\s*$') { Write-Output ('set ' + $matches[1] + '=' + $matches[2]) } }"`) do (
    %%i
)
echo.

echo Logging in to Azure 
echo.
call az login --scope https://management.core.windows.net//.default
echo Logged in
echo.

:: Prompt user for first deployment or redeployment
echo.
echo Is this the first deployment or a redeployment to an existing app?
set /p choice="Choose F for first deployment or R for redeployment: "
echo.

if /i "%choice%"=="F" (goto :first_deployment)
if /i "%choice%"=="R" (goto :redeployment)

:: Invalid choice
echo Invalid choice. Exiting script.
exit /b 1

:first_deployment
:: First deployment
:: echo Deploying app to Azure for the first time
echo.
call az webapp up --runtime %AZURE_APP_RUNTIME%  --sku %AZURE_APP_SKU% --name %AZURE_APP_NAME% --resource-group %AZURE_RESOURCE_GROUP% --location %AZURE_LOCATION%
call az webapp config set --startup-file "python3 -m gunicorn app:app" --name %AZURE_APP_NAME%
goto :end

:redeployment
:: Redeployment
echo Redeploying app to existing Azure app %AZURE_APP_NAME%
echo.
call az webapp config appsettings set -g %AZURE_RESOURCE_GROUP% -n %AZURE_APP_NAME% --settings WEBSITE_WEBDEPLOY_USE_SCM=false
call az webapp up --runtime %AZURE_APP_RUNTIME%  --sku %AZURE_APP_SKU% --name %AZURE_APP_NAME% --resource-group %AZURE_RESOURCE_GROUP%
call az webapp config set --startup-file "python3 -m gunicorn app:app" --name %AZURE_APP_NAME%

goto :end

:end
endlocal