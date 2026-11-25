# Spec Delta

## MODIFIED Requirements

### Requirement: Choices on the form
The form SHALL offer: audio source (Chrome tab, default; entire screen or app such as Zoom, labelled "Весь экран / приложение (Zoom)"; or microphone); call language (German, default, English, or automatic German and English); provider; translation model; hint model; a free-text call context with the placeholder "Кто звонит, куда, зачем. Например: запись к терапевту; техническое интервью на Magento-разработчика"; a free-text "my data" field with the placeholder "Имя, дата рождения, страховая, профессия и стек — то, о чём могут спросить"; and a start button.

#### Scenario: Defaults
- **WHEN** nothing was remembered and the server's default provider is Gemini
- **THEN** the form shows tab, German, Gemini, that provider's default translation model and default hint model, and empty text fields

#### Scenario: Placeholders
- **WHEN** the form is shown
- **THEN** the two text fields show the texts above as placeholders

#### Scenario: Entire screen remembered
- **WHEN** the user picks "Весь экран / приложение (Zoom)", starts a call and comes back
- **THEN** that source is preselected
