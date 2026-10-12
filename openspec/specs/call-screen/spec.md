# call-screen Specification

## Purpose
Shows the call as it happens in a narrow window next to the video call: who said what, its translation, what to answer, and what the app is doing.

## Requirements

### Requirement: Header
The header SHALL show the state of the call in words (connecting «подключение…», listening «слушаю», speaking «собеседник говорит», reconnecting «переподключение…», stopped «остановлено»), the chosen language, provider and translation model in small text, a stop button, and the current error text if there is one.

#### Scenario: State labels
- **WHEN** the call state is `speaking`
- **THEN** the header shows "собеседник говорит"

#### Scenario: Error line
- **WHEN** the state holds an error text
- **THEN** the header shows that text and no pop-up appears

### Requirement: Sentence cards
Each sentence SHALL be shown as one entry in order of arrival, newest at the bottom, with the original text in at least 20 px type and high contrast, and the translation below it in a smaller size and a different colour.

#### Scenario: Entry content
- **WHEN** a sentence "Guten Tag." with translation "Добрый день." exists
- **THEN** both texts are shown, the original larger than the translation

### Requirement: Translation states
While the translation has not arrived the card SHALL show a thin loading indicator; if the translation failed the card SHALL show "перевод не получен" and a "повторить" button that asks for the translation again.

#### Scenario: Waiting
- **WHEN** a card's translation is waiting or streaming without text
- **THEN** a loading indicator is shown under the original

#### Scenario: Failed
- **WHEN** a card's translation failed
- **THEN** "перевод не получен" and a "повторить" button are shown, and pressing it requests the translation again

### Requirement: Hint buttons and block
Each card SHALL have the buttons "Коротко" and "Подробно"; pressing one SHALL request a hint of that kind and show the streamed hint under the translation; pressing either button again SHALL replace the previous hint; a failed hint SHALL show "подсказка не получена".

#### Scenario: Request a short hint
- **WHEN** the user presses "Коротко" on a card
- **THEN** a short hint is requested for that card

#### Scenario: Streaming hint
- **WHEN** hint text arrives for a card
- **THEN** it appears in a block under the translation as it comes

#### Scenario: Failed hint
- **WHEN** the hint failed
- **THEN** the block says "подсказка не получена"

### Requirement: Hotkeys for the latest card
Pressing `1` SHALL request a short hint and `2` a detailed hint for the latest card, except when the keyboard focus is in a text field, a selection list or when a modifier key is held; the latest card SHALL show these keys next to its buttons.

#### Scenario: Key press
- **WHEN** the user presses `2` and focus is not in a field
- **THEN** a detailed hint is requested for the latest card

#### Scenario: Typing
- **WHEN** focus is in a text field and `1` is pressed
- **THEN** nothing is requested

### Requirement: Live phrase
Below the entries the screen SHALL show the unfinished phrase: its confirmed part in normal colour and its guessed part in grey, without a translation; it SHALL be hidden when empty.

#### Scenario: Live phrase
- **WHEN** the confirmed part is "Wie geht" and the guessed part is "es"
- **THEN** "Wie geht" is shown normally and "es" in grey

#### Scenario: Nothing being said
- **WHEN** both parts are empty
- **THEN** no live phrase is shown

### Requirement: Automatic scrolling
The feed SHALL scroll to the newest content when it changes, SHALL stop doing so once the user scrolls up, and SHALL resume when the user returns to the bottom.

#### Scenario: Follows new text
- **WHEN** the feed is at the bottom and a new card arrives
- **THEN** the feed scrolls to show it

#### Scenario: User reading history
- **WHEN** the user has scrolled up and a new card arrives
- **THEN** the position does not change

### Requirement: No requests after the end
After the call has stopped, the hint buttons SHALL be disabled, the "повторить" button hidden and the hotkeys inactive.

#### Scenario: Stopped call
- **WHEN** the call has stopped and the user presses `1`
- **THEN** nothing is requested

### Requirement: Ending and restarting
After the call has stopped, the screen SHALL keep the cards visible and offer a "Начать заново" button that returns to the setup form.

#### Scenario: After stop
- **WHEN** the call has stopped
- **THEN** the cards stay and "Начать заново" is offered

### Requirement: Narrow window
The layout SHALL work without horizontal scrolling at widths from 420 px, in a dark theme with system fonts, and without modal windows or pop-up notices during a call.

#### Scenario: 420 px
- **WHEN** the window is 420 px wide
- **THEN** all texts and buttons are visible without horizontal scrolling
