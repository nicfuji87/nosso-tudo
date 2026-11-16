# Saúde NT — app Galaxy Watch 6 (Wear OS)

Módulo de saúde do Nosso Tudo. **Fase 1 = prova de capacidade dos sensores**: descobrir o que o
Watch 6 (One UI 8 Watch / Wear OS 6) realmente entrega pelo Samsung Health Sensor SDK, com que
qualidade, e quanto custa de bateria. Ainda não tem backend: os dados ficam no relógio e são puxados por ADB.

## Estrutura

```
saude-android/
  wear/                 app do relógio (Kotlin, sem Compose, zero dependências além do SDK Samsung)
    libs/               ← coloque aqui o .aar do Samsung Health Sensor SDK (não versionado)
    stub/               stub de compilação usado só quando libs/ está vazio (APK não funcional)
  scripts/
    puxar-dados.ps1     copia files/ do relógio para dados/ (não versionado)
    analisar.mjs        qualidade do IBI, RMSSD por janela de 5 min, movimento, bateria
  mobile/               (Fase 2) app complementar: Samsung Health Data SDK + sincronização
```

Toolchain: AGP 8.13.2 · Gradle 8.14.3 · Kotlin 2.3.21 · compileSdk/targetSdk 36 · minSdk 30.
JDK: o JBR do Android Studio (`D:\Android Studio\jbr`).

## Preparar o relógio (uma vez)

1. Configurações → Sobre o relógio → Software → tocar 5× em **Versão do software**.
2. Opções do desenvolvedor → **Depuração ADB** e **Depuração sem fio** ligadas; Wi-Fi automático desligado.
3. Modo dev do **Health Platform** (necessário para usar o Sensor SDK sem parceria):
   ver https://developer.samsung.com/health/sensor/guide/device-settings.html

## Compilar, instalar, coletar

Dois ambientes (flavors) no mesmo projeto Supabase, separados por Edge Function e workspace
(detalhes em `supabase/dev/README.md`):

| Flavor | App no relógio | Edge Function | Medição automática |
|---|---|---|---|
| `prod` | `app.nossotudo.saude.wear` · "Saúde NT" | `saude-relogio` (dados reais) | ligada |
| `dev` | `app.nossotudo.saude.wear.dev` · "Saúde NT DEV" | `saude-relogio-dev` (só workspace de teste) | desligada |

```powershell
$env:JAVA_HOME = "D:\Android Studio\jbr"
.\gradlew.bat :wear:assembleProdDebug :wear:assembleDevDebug
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb pair <ip>:<porta-de-pareamento>       # código mostrado no relógio
& $adb connect <ip>:<porta>
& $adb install -r wear\build\outputs\apk\prod\debug\wear-prod-debug.apk   # seus dados reais
& $adb install -r wear\build\outputs\apk\dev\debug\wear-dev-debug.apk     # testes
```

No relógio: **1. Permissões** → **2. Capacidades** → **Coletar**. Depois:

```powershell
powershell -File scripts\puxar-dados.ps1
node scripts\analisar.mjs
```

## Protocolo da Fase 1

| Teste | Como | O que responde |
|---|---|---|
| Capacidades | botão 2 | quais rastreadores o Watch 6 expõe (`capacidades.txt`) |
| Repouso | 15 min sentado, coleta HR+IBI | % de IBI válido parado, RMSSD estável? |
| Movimento | 15 min andando | quanto o movimento destrói o IBI |
| Noite | coleta durante o sono | cobertura noturna (base da HRV noturna) |
| Bateria | 72 h com coleta ligada (sem PPG) | %/h e autonomia real |
| PPG | 10 min com "Coletar + PPG" | taxa real (~25 Hz?) e custo extra de bateria |
| ECG | botão ECG, dedo no botão superior | amostras/s (~500 Hz?) e permissão |

Dados de saúde são sensíveis (LGPD): `dados/` e o `.aar` ficam fora do controle de versão.
Uso pessoal / bem-estar — nada aqui é diagnóstico.
