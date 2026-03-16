# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is a hackathon project for the NVDA "Agents for Impact" event at SJSU. The repository is currently in its initial state — update this file as the project takes shape.

## Stack

- **Backend**: Node.js + Express (`server.js`) — proxies NVIDIA Nemotron API
- **Frontend**: Vanilla HTML/CSS/JS (`public/index.html`) — no build step
- **Model**: `nvidia/llama-3.1-nemotron-nano-8b-v1` via NVIDIA NIM

## Getting Started

1. Copy `.env.example` to `.env` and add your NVIDIA API key:
   ```
   cp .env.example .env
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open `http://localhost:3000`
