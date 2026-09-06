# Product Intent

Build a visually striking, consumer-friendly **travel intelligence and discovery platform** centred around an interactive 3D globe.

The app visualises **global travel flows** and uses lightweight social-media intelligence to identify **emerging destinations within countries**. Users can explore the world visually, select a country, and progressively zoom into that country's tourism landscape to discover which destinations are gaining attention, where visitors are coming from, and what travellers are saying.

The product should feel like **exploring a living map of global travel**, rather than using a conventional tourism analytics dashboard.

## Core Experience

### 1. Global Globe

The opening screen is dominated by a beautiful interactive 3D globe.

Visualised travel flows move between countries and major destinations, creating an immediate sense of global movement.

Flights should preferably be represented as **aggregated travel flows rather than individual real-time aircraft** if this makes the MVP substantially easier to build.

For example:

**UK → Thailand**  
**India → Thailand**  
**Germany → Spain**

can appear as animated flight paths with moving aircraft/particles.

The globe should communicate:

- where people are travelling from
- where they are travelling to
- relative magnitude of travel flows
- potentially which destinations are currently gaining momentum

The visual experience is the primary differentiator of the MVP.

### 2. Country Exploration

Selecting a country transitions the globe into a closer view of that country.

For example:

**Thailand**

The interface then reveals:

- Bangkok
- Phuket
- Krabi
- Chiang Mai
- Koh Samui
- Koh Lanta
- other relevant destinations

Travel flows into the country remain visible, showing where visitors are coming from.

The user should be able to understand at a glance:

> **Who is travelling here, where are they going, and what is becoming interesting?**

### 3. Emerging Destination Intelligence

This is the core intelligence feature.

The system identifies destinations within the selected country that are experiencing **unusual growth in online travel interest**.

Example:

> ### 🔥 Emerging
>
> **Koh Lanta**
>
> Traveller interest ↑ 84%
>
> Fastest-growing source markets:
> 🇸🇬 Singapore  
> 🇬🇧 United Kingdom  
> 🇩🇪 Germany

The system should distinguish between:

- established/popular destinations
- rapidly emerging destinations
- declining destinations
- unusual/new signals

The goal is to surface places that a user might **not already know about**.

### 4. Lightweight Social Intelligence

Public online conversations provide context for why a destination is emerging.

For a destination, the app might show:

> **Why is Koh Lanta gaining attention?**
>
> 🏝️ Beaches  
> 🌿 Less crowded than Phuket  
> 💰 Affordable  
> 🤿 Diving  
> ☀️ Winter travel

It can also surface traveller sentiment and recurring complaints:

> **What travellers are saying**
>
> “Much quieter than Phuket”
>
> “Beautiful beaches”
>
> “Getting harder to find cheap accommodation”

Social data should be treated as a **signal and source of qualitative context**, not as a statistically representative survey.

### 5. Traveller Origins

Where sufficient public data exists, estimate the likely origin of travellers discussing a destination.

For example:

> **Who is talking about Thailand?**
>
> 🇬🇧 UK ↑  
> 🇮🇳 India ↑↑  
> 🇸🇬 Singapore ↑↑↑  
> 🇺🇸 US ↓

Origin should be presented as an **inferred signal**, with uncertainty where appropriate.

The app should never imply that social-media data constitutes the actual nationality distribution of tourists.

## Flight / Travel Data

Flight information should primarily provide the **physical-world travel-flow layer** of the product.

For the MVP, prefer the simplest available data source.

The product does not need to show every individual commercial flight.

Instead, aggregate flows such as:

**London → Bangkok**  
**Mumbai → Bangkok**  
**Singapore → Phuket**

can be visualised as animated routes.

If inexpensive/free flight data permits real flight information to be overlaid without significantly increasing complexity, use it. Otherwise, use aggregated route/capacity data.

The visualisation should prioritise **clarity and beauty over aviation precision**.

## Data Architecture

The MVP should use inexpensive/free publicly accessible data wherever possible.

Potential inputs:

- Bluesky public posts/firehose
- 4chan public API
- Mastodon public posts
- freely available/open flight or ADS-B data
- publicly available tourism statistics for validation
- potentially free flight APIs where their terms permit the intended use

Social collectors should **not ingest an entire platform unnecessarily**.

For a selected country/destination, dynamically generate a monitoring vocabulary containing:

- country names
- destination names
- aliases
- relevant travel terminology
- emerging destination names discovered by the system

Posts should first undergo a cheap relevance filter, with only relevant candidates passed to more expensive processing.

## Intelligence Pipeline

Conceptually:

**Public conversations + travel-flow data**

↓

**Destination/entity extraction**

↓

**Travel relevance filtering**

↓

**Origin inference where possible**

↓

**Topic/sentiment extraction**

↓

**Destination-level aggregation**

↓

**Trend / anomaly detection**

↓

**Emerging destination ranking**

↓

**Human-friendly explanation**

The system should rely primarily on quantitative trend detection rather than asking an LLM to arbitrarily decide what is "trending."

AI should be used mainly to:

- classify conversations
- identify destinations/entities
- cluster similar discussions
- infer themes
- summarise why a destination is gaining attention

## Visual Design Direction

The UI should feel **premium, cinematic and exploratory**, not like enterprise business intelligence software.

The globe should be the hero element.

Think:

- dark immersive background
- large 3D Earth
- animated travel routes
- subtle aircraft/particle movement
- glowing destination points
- smooth camera transitions
- minimal text
- large photographic destination imagery
- elegant typography
- fluid zoom from world → country → destination

The first screen should be understandable without reading documentation.

The intended reaction is:

> **“Wow — I can see the world moving.”**

followed by:

> **“What is happening in Thailand?”**

and then:

> **“Wait, why is this little destination suddenly blowing up?”**

## MVP Screens

### Screen 1 — Explore

Interactive world globe showing major travel flows and emerging destinations.

### Screen 2 — Country

Zoomed country view with inbound travel flows and destination-level signals.

### Screen 3 — Destination

A beautiful destination profile showing:

- emerging/popularity status
- growth in online interest
- likely traveller origins
- key themes
- positive/negative sentiment
- representative public conversation
- travel-flow context

### Screen 4 — Discover

Optional feed of:

**“Emerging destinations around the world”**

with ranked destinations and short AI-generated explanations.

## MVP Principle

Do not attempt to build a comprehensive tourism intelligence platform.

The MVP should prove one compelling idea:

> **Can we combine simple travel-flow data with public online conversations to create a beautiful, intuitive way of discovering where travel interest is emerging?**

The product should optimise for **visual impact, exploration and discovery** first, and analytical depth second.

Future versions can add richer aviation data, accommodation data, search data, private aviation, official tourism statistics and professional tourism-board intelligence.
