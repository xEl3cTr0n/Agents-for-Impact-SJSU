# Situation Awareness Agent

An AI agent for the Agents for Impact hackathon that helps users respond to risky or uncertain real-life situations by:

- understanding context
- assessing risk level
- generating step-by-step actions
- drafting a message the user can send immediately

## Hackathon

Agents for Impact at SJSU

## Powered By

- NVIDIA Nemotron for reasoning and planning
- A lightweight Node frontend and API

## Example

Input:

`I think someone is following me at night`

Output:

- Risk Level: HIGH
- Actions:
  1. Move to a well-lit area
  2. Call a trusted contact
- Message:
  `Hey, I think I'm being followed. Can you stay on call with me?`

## Goal

Turn uncertainty into clear, actionable next steps in seconds.

## Run Locally

1. Add `NVIDIA_API_KEY` to `.env`
2. Optional: set `NVIDIA_MODEL` in `.env` if you want to override the default model
3. Install dependencies: `npm install --cache .npm-cache`
4. Start the app: `npm start`
5. Open `http://localhost:3000`

The app sends the user situation to Nemotron, validates the JSON response shape, then renders:

- risk level
- actions
- suggested message

Default model:

- `nvidia/llama-3.1-nemotron-nano-8b-v1`

If you want to experiment with NVIDIA's content-safety model from the linked docs, set:

- `NVIDIA_MODEL=nvidia/nemotron-content-safety-reasoning-4b`

That model is designed as a safety classifier/guardrail, so it is better suited as an additional moderation layer than as the primary structured-planning model for this UI.

## Important Note

This project is a hackathon prototype. For emergencies, users should contact local emergency services immediately.
