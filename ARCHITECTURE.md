# Architecture

## Flow

User Input
  ->
Nemotron API
  ->
Structured JSON Output
  ->
Frontend Display

## Components

### 1. Input Layer

- Single text input for the user's situation

### 2. Reasoning Layer

- Classifies situation type
- Assesses urgency and risk
- Generates next-step actions
- Drafts an optional message to send

### 3. Output Layer

The app renders a structured payload like:

```json
{
  "situation_type": "",
  "risk_level": "",
  "actions": [],
  "message": ""
}
```

## Optional Enhancements

- Add tool calling for maps, contacts, or reporting flows
- Add a scenario picker for fast demoing
- Add a one-click "copy message" action
