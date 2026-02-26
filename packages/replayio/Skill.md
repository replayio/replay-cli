---
name: replayio browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
allowed-tools: Bash(replayio browser:*)
---

# Browser Automation with replayio browser

## Quick start

```bash
# open new browser
replayio browser open
# navigate to a page
replayio browser goto https://playwright.dev
# interact with the page using refs from the snapshot
replayio browser click e15
replayio browser type "page.click"
replayio browser press Enter
# take a screenshot
replayio browser screenshot
# close the browser
replayio browser close
```

## Commands

### Core

```bash
replayio browser open
# open and navigate right away
replayio browser open https://example.com/
replayio browser goto https://playwright.dev
replayio browser type "search query"
replayio browser click e3
replayio browser dblclick e7
replayio browser fill e5 "user@example.com"
replayio browser drag e2 e8
replayio browser hover e4
replayio browser select e9 "option-value"
replayio browser upload ./document.pdf
replayio browser check e12
replayio browser uncheck e12
replayio browser snapshot
replayio browser snapshot --filename=after-click.yaml
replayio browser eval "document.title"
replayio browser eval "el => el.textContent" e5
replayio browser dialog-accept
replayio browser dialog-accept "confirmation text"
replayio browser dialog-dismiss
replayio browser resize 1920 1080
replayio browser close
```

### Navigation

```bash
replayio browser go-back
replayio browser go-forward
replayio browser reload
```

### Keyboard

```bash
replayio browser press Enter
replayio browser press ArrowDown
replayio browser keydown Shift
replayio browser keyup Shift
```

### Mouse

```bash
replayio browser mousemove 150 300
replayio browser mousedown
replayio browser mousedown right
replayio browser mouseup
replayio browser mouseup right
replayio browser mousewheel 0 100
```

### Save as

```bash
replayio browser screenshot
replayio browser screenshot e5
replayio browser screenshot --filename=page.png
replayio browser pdf --filename=page.pdf
```

### Tabs

```bash
replayio browser tab-list
replayio browser tab-new
replayio browser tab-new https://example.com/page
replayio browser tab-close
replayio browser tab-close 2
replayio browser tab-select 0
```

### Install

```bash
replayio install 
```

### Browser Sessions

```bash
# create new browser session named "mysession" with persistent profile
replayio browser -s=mysession open example.com --persistent
# same with manually specified profile directory (use when requested explicitly)
replayio browser -s=mysession open example.com --profile=/path/to/profile
replayio browser -s=mysession click e6
replayio browser -s=mysession close  # stop a named browser
replayio browser -s=mysession delete-data  # delete user data for persistent session

replayio browser list
# Close all browsers
replayio browser close-all
# Forcefully kill all browser processes
replayio browser kill-all
```

## Example: Form submission

```bash
replayio browser open https://example.com/form
replayio browser snapshot

replayio browser fill e1 "user@example.com"
replayio browser fill e2 "password123"
replayio browser click e3
replayio browser snapshot
replayio browser close
```
