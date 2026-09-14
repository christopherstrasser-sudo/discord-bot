param(
    [switch]$Once
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptRoot 'config.json'

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Bridge config not found: $configPath"
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$repoUrl = [string]$config.repository
$branch = [string]$config.branch
$targetPath = [string]$config.targetPath
$pollSeconds = [int]$config.pollSeconds

if ([string]::IsNullOrWhiteSpace($repoUrl) -or [string]::IsNullOrWhiteSpace($branch) -or [string]::IsNullOrWhiteSpace($targetPath)) {
    throw 'repository, branch and targetPath must be configured.'
}

if ($pollSeconds -lt 5) {
    $pollSeconds = 5
}

$statePath = Join-Path $targetPath '.bridge-state'
$logPath = Join-Path $statePath 'bridge.log'
$lastHeadPath = Join-Path $statePath 'last-head.txt'

function Write-BridgeLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR')][string]$Level = 'INFO'
    )

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line

    if (Test-Path -LiteralPath $targetPath) {
        if (-not (Test-Path -LiteralPath $statePath)) {
            New-Item -ItemType Directory -Path $statePath -Force | Out-Null
        }
        Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    }
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure
    )

    $output = & git @Arguments 2>&1
    $exitCode = $LASTEXITCODE

    if (-not $AllowFailure -and $exitCode -ne 0) {
        $text = ($output | Out-String).Trim()
        throw "git $($Arguments -join ' ') failed with exit code $exitCode. $text"
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output   = @($output)
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is not installed or not available in PATH.'
}

if (-not (Test-Path -LiteralPath $targetPath)) {
    $parentPath = Split-Path -Parent $targetPath
    if (-not (Test-Path -LiteralPath $parentPath)) {
        New-Item -ItemType Directory -Path $parentPath -Force | Out-Null
    }

    Write-Host "Target does not exist. Cloning $repoUrl to $targetPath ..."
    Invoke-Git -Arguments @('clone', '--branch', $branch, '--single-branch', $repoUrl, $targetPath) | Out-Null
}

$gitPath = Join-Path $targetPath '.git'
if (-not (Test-Path -LiteralPath $gitPath)) {
    throw "Target exists but is not a Git repository: $targetPath"
}

if (-not (Test-Path -LiteralPath $statePath)) {
    New-Item -ItemType Directory -Path $statePath -Force | Out-Null
}

$originResult = Invoke-Git -Arguments @('-C', $targetPath, 'remote', 'get-url', 'origin')
$originUrl = ($originResult.Output | Select-Object -First 1).ToString().Trim()
if ($originUrl -ne $repoUrl) {
    throw "Unexpected origin URL. Expected '$repoUrl', found '$originUrl'."
}

Write-BridgeLog 'Raku Dev Bridge started.'
Write-BridgeLog "Repository: $repoUrl"
Write-BridgeLog "Branch: $branch"
Write-BridgeLog "Local path: $targetPath"
Write-BridgeLog "Polling every $pollSeconds seconds."
Write-BridgeLog 'Safety mode: fast-forward only; dirty working trees are never overwritten.'

while ($true) {
    try {
        $currentBranchResult = Invoke-Git -Arguments @('-C', $targetPath, 'branch', '--show-current')
        $currentBranch = ($currentBranchResult.Output | Select-Object -First 1).ToString().Trim()

        if ($currentBranch -ne $branch) {
            Write-BridgeLog "Current branch is '$currentBranch', expected '$branch'. Update skipped." 'WARN'
        }
        else {
            $statusResult = Invoke-Git -Arguments @('-C', $targetPath, 'status', '--porcelain')
            $dirtyLines = @($statusResult.Output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

            if ($dirtyLines.Count -gt 0) {
                Write-BridgeLog "Local changes detected ($($dirtyLines.Count) item(s)). Update skipped to protect local work." 'WARN'
            }
            else {
                $fetchResult = Invoke-Git -Arguments @('-C', $targetPath, 'fetch', '--prune', 'origin', $branch) -AllowFailure
                if ($fetchResult.ExitCode -ne 0) {
                    $fetchText = ($fetchResult.Output | Out-String).Trim()
                    Write-BridgeLog "Fetch failed: $fetchText" 'WARN'
                }
                else {
                    $localResult = Invoke-Git -Arguments @('-C', $targetPath, 'rev-parse', 'HEAD')
                    $remoteResult = Invoke-Git -Arguments @('-C', $targetPath, 'rev-parse', "origin/$branch")
                    $localHead = ($localResult.Output | Select-Object -First 1).ToString().Trim()
                    $remoteHead = ($remoteResult.Output | Select-Object -First 1).ToString().Trim()

                    if ($localHead -eq $remoteHead) {
                        # Already current. Stay quiet to keep the log readable.
                    }
                    else {
                        $ffCheck = Invoke-Git -Arguments @('-C', $targetPath, 'merge-base', '--is-ancestor', $localHead, $remoteHead) -AllowFailure

                        if ($ffCheck.ExitCode -eq 0) {
                            Set-Content -LiteralPath $lastHeadPath -Value $localHead -Encoding ASCII
                            $mergeResult = Invoke-Git -Arguments @('-C', $targetPath, 'merge', '--ff-only', "origin/$branch")
                            $mergeText = ($mergeResult.Output | Out-String).Trim()
                            Write-BridgeLog "Updated $localHead -> $remoteHead. $mergeText"
                        }
                        else {
                            $aheadCheck = Invoke-Git -Arguments @('-C', $targetPath, 'merge-base', '--is-ancestor', $remoteHead, $localHead) -AllowFailure

                            if ($aheadCheck.ExitCode -eq 0) {
                                Write-BridgeLog "Local branch contains commit(s) not on origin/$branch. No automatic reset performed." 'WARN'
                            }
                            else {
                                Write-BridgeLog "Local and origin/$branch have diverged. Manual resolution required; nothing was overwritten." 'WARN'
                            }
                        }
                    }
                }
            }
        }
    }
    catch {
        Write-BridgeLog $_.Exception.Message 'ERROR'
    }

    if ($Once) {
        break
    }

    Start-Sleep -Seconds $pollSeconds
}
