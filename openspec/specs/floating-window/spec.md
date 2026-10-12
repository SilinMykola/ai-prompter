# floating-window Specification

## Purpose
Lets the user keep the call screen in a small window that stays above all other windows, so that it can sit over the video call without being covered.

## Requirements

### Requirement: Offered only where it works
The call screen SHALL offer the button "Вынести поверх окон" only in a browser that supports opening a floating window, and not after the call has stopped.

#### Scenario: Supported browser
- **WHEN** the browser supports floating windows and the call is running
- **THEN** the button is shown

#### Scenario: Unsupported browser
- **WHEN** the browser does not support floating windows
- **THEN** no button is shown and nothing else changes

#### Scenario: Stopped call
- **WHEN** the call has stopped
- **THEN** the button is not shown

### Requirement: Opening from a click
Pressing the button SHALL open a floating window about 420 px wide, directly from the click, because browsers allow it only after a user action.

#### Scenario: Window requested
- **WHEN** the user presses the button
- **THEN** a floating window about 420 px wide is requested immediately

#### Scenario: Refused
- **WHEN** the browser refuses to open the window
- **THEN** the call screen stays in the main page and a short note says the window could not be opened

### Requirement: Late or broken windows are cleaned up
A window that finishes opening after the user already moved on, or that cannot be set up, SHALL be closed instead of left behind, and a failure SHALL be reported on the page above any other short note.

#### Scenario: Moved on while opening
- **WHEN** the user leaves the call screen while the browser is still opening the window
- **THEN** the window is closed as soon as it appears and nothing is shown in it

#### Scenario: Setup fails
- **WHEN** the new window cannot be prepared
- **THEN** it is closed and the failure note is shown

### Requirement: The same screen in the floating window
The floating window SHALL show the same call screen as the main page, with the application's styles, and all of its controls (hint buttons, retry, stop, scrolling) SHALL work inside it.

#### Scenario: Content moved
- **WHEN** the floating window is open
- **THEN** the call screen (status, sentences, live phrase) is shown in it and not in the main page

#### Scenario: Buttons work
- **WHEN** the user presses "Коротко" on a sentence in the floating window
- **THEN** a short hint is requested for that sentence

#### Scenario: Styles
- **WHEN** the floating window opens
- **THEN** it uses the same colours, fonts and layout as the main page

### Requirement: Hotkeys in the floating window
While the floating window has the keyboard focus, `1` and `2` SHALL request hints for the latest sentence as in the main page, with the same exceptions.

#### Scenario: Key in the floating window
- **WHEN** the floating window has focus and the user presses `2`
- **THEN** a detailed hint is requested for the latest sentence

### Requirement: The call keeps running in the main page
Opening the floating window SHALL NOT interrupt capture, the connection or the screen state, and the main page SHALL show a short note with a button "Вернуть" while the window is open.

#### Scenario: Call continues
- **WHEN** the floating window is open and the other person speaks
- **THEN** new sentences appear in the floating window

#### Scenario: Note in the main page
- **WHEN** the floating window is open
- **THEN** the main page shows a note and the button "Вернуть"

### Requirement: Coming back
Pressing "Вернуть" or closing the floating window SHALL put the call screen back into the main page, keeping all sentences.

#### Scenario: Window closed by the user
- **WHEN** the user closes the floating window
- **THEN** the call screen is shown in the main page again with all sentences

#### Scenario: Return button
- **WHEN** the user presses "Вернуть"
- **THEN** the floating window closes and the call screen is shown in the main page

### Requirement: The window never outlives the call screen
Going back to the setup form, or closing the page, SHALL close the floating window.

#### Scenario: Restart
- **WHEN** the user leaves the call screen for the setup form
- **THEN** the floating window is closed

#### Scenario: Page unmounted
- **WHEN** the application is removed from the page
- **THEN** the floating window is closed
