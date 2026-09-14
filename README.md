# Discord Bot

Multi-user Discord bot with a web dashboard for per-server configuration.

## Development bridge (Windows server)

The repository is mirrored to `C:\Discord-Bot` by the Raku Dev Bridge.

### First setup

If `C:\Discord-Bot` does not exist yet:

```bat
git clone https://github.com/christopherstrasser-sudo/discord-bot.git C:\Discord-Bot
C:\Discord-Bot\dev-bridge\start-dev-bridge.cmd
```

If the repository is already cloned at `C:\Discord-Bot`, start only:

```bat
C:\Discord-Bot\dev-bridge\start-dev-bridge.cmd
```

### Bridge behavior

- watches `origin/main` every 15 seconds
- only performs fast-forward updates
- never overwrites an unclean working tree
- never resets local commits automatically
- logs to `C:\Discord-Bot\.bridge-state\bridge.log`
- stores the previous revision before an automatic update for guarded rollback

Stop the bridge with `Ctrl+C`.

For a rollback, stop the bridge first and run:

```bat
C:\Discord-Bot\dev-bridge\rollback.cmd
```
