# UltraTable Roadmap

## Vision
UltraTable is an embeddable sports standings and prediction widget platform. League admins and content creators can integrate real-time data from their own API sources, enable fan predictions, and showcase head-to-head accuracy battles.

## Overall Roadmap

### MVP
  - A standings table with EFL data deployed 
    * (UI MVP is mostly complete)
  - GQL Service with Postgres DB in the cloud (Supabase) 
    * GQL Service is successfully feeding the UI MVP
    * Supabase is deployed
    * GQL service deployment is TBD
  - Secure connection between service and database 
    * Still TBD
  - Oauth login for users 
    * Still TBD
 
### Post MVP : Prediction System 

**1. Prediction Submission**
- View upcoming fixtures for next gameweek
- Submit score predictions (e.g., "City 2-1 United")
- Lock predictions at kickoff time
- Edit predictions before lock time
- Visual prediction history

**2. Predictor Profiles**
- Named personas (e.g., "OptimisticOllie", "PessimisticPete", "TheExpert")
- Profile stats:
  - Total predictions made
  - Exact score hits (3 points)
  - Correct outcome (1 point)
  - Overall accuracy %
  - Current streak
  - Best streak
- Public profile pages with shareable URLs
- Profile avatars/badges
- Achievement system

**3. Scoring Algorithm**
```
Exact Score: 3 points (predicted 2-1, actual 2-1)
Correct Outcome: 1 point (predicted 3-1, actual 2-0 - both wins)
Wrong: 0 points
```

Additional scoring ideas:
- Bonus points for correct goal difference
- Double points for derby matches
- Streak multipliers

**4. Head-to-Head Comparisons**
- Compare two predictor profiles
- Week-by-week breakdown
- Overall season stats
- Visual comparison charts
- "Streamer vs Streamer" battles
- "Fans vs Pundits" competitions

**5. Review Features**
- Post-match prediction review
- Highlight correct/incorrect predictions
- Show what actually happened vs predictions
- Weekly roundup of predictions
- "Hot takes that aged poorly"


## Phase 3: Stream Integration Widgets

### Embeddable Widgets for Content Creators

**1. Prediction Banner**
```html
<!-- Horizontal banner for stream overlay -->
<ultra-prediction-banner
  profile="streamer123"
  layout="horizontal"
  show-stats="accuracy,streak,points"
  theme="dark"></ultra-prediction-banner>
```

Displays:
- Profile name/avatar
- Live accuracy percentage
- Current streak
- Total points

**2. Upcoming Predictions**
```html
<!-- Show next gameweek predictions -->
<ultra-predictions
  profile="streamer123"
  gameweek="current"
  theme="dark"
  compact="true"></ultra-predictions>
```

Displays:
- Upcoming fixture predictions
- Lock status
- Confidence ratings

**3. Head-to-Head Widget**
```html
<!-- Compare two predictors -->
<ultra-vs
  profile-a="streamer1"
  profile-b="streamer2"
  show-fixtures="true"
  theme="dark"></ultra-vs>
```

Displays:
- Side-by-side stats
- Current gameweek predictions
- Overall record

**4. Leaderboard Widget**
```html
<!-- Show top predictors -->
<ultra-leaderboard
  league="efl-championship"
  limit="10"
  theme="dark"></ultra-leaderboard>
```

**5. Match Prediction Widget**
```html
<!-- Single match prediction -->
<ultra-match-prediction
  fixture-id="12345"
  show-profiles="true"
  theme="dark"></ultra-match-prediction>
```

### Widget Features
- Themeable (dark/light/custom)
- Responsive sizing
- Auto-refresh
- No dependencies on parent page
- Isolated styles (shadow DOM)
- Accessible
- Performance optimized

---

## Phase 4: Multi-Provider Support

### Data Source Integrations

**1. API-Football** (Current)
- ✅ Already integrated
- Requires user API key

**2. TheSportsDB**
- Free tier available
- Good for testing
- Limited data

**3. SofaScore API**
- Comprehensive data
- Real-time updates

**4. Custom JSON Endpoints**
- User provides their own API
- Define mapping schema
- Useful for smaller leagues

**5. CSV/Google Sheets Import**
- Manual data entry
- Good for amateur leagues
- Scheduled refresh

**6. Web Scraping (optional)**
- For leagues without APIs
- User-configurable selectors
- Runs client-side

### Provider Registry System

```typescript
interface DataProvider {
  id: string;
  name: string;
  requiresAuth: boolean;
  authType: 'api-key' | 'oauth' | 'none';
  endpoints: {
    fixtures: string;
    standings: string;
    teams: string;
    players?: string;
  };
  rateLimits?: {
    requestsPerDay: number;
    requestsPerMinute: number;
  };
  mapper: DataMapper; // Transform API response to our format
}
```

---

## Phase 5: Configuration & Embed System

### Widget Builder UI

**1. League Configuration**
- Choose data provider
- Enter API key (stored locally)
- Select league and season
- Test connection

**2. Visual Customization**
- Color scheme picker
- Font selection
- Layout options (compact/detailed)
- Show/hide columns
- Logo/branding upload

**3. Feature Toggles**
- Enable predictions
- Show player popups
- Display form indicators
- Show venue images

**4. Embed Code Generator**
- Generate script tag
- Provide configuration options
- Copy-paste ready
- Preview widget

### Self-Hosting Option

**NPM Package**
```bash
npm install @ultratable/widget
```

```javascript
import { UltraTable } from '@ultratable/widget';

new UltraTable({
  container: '#standings',
  league: 39,
  season: 2024,
  provider: 'api-football',
  apiKey: 'user-key',
  features: {
    predictions: true,
    playerPopups: true
  },
  theme: {
    primary: '#4CAF50',
    background: '#1a1a1a'
  }
});
```

---

## Phase 6: Social & Sharing Features

### Community Features

**1. Public Leaderboards**
- Top predictors globally
- Filter by league/season
- Weekly/monthly/all-time
- Country-based rankings

**2. Prediction Pools**
- Create private prediction groups
- Invite friends via link
- Group leaderboard
- Prize pools (optional)

**3. Social Sharing**
- Share predictions to Twitter/Facebook
- "I predicted X" posts
- Prediction results cards
- Profile badges

**4. Challenges**
- Weekly prediction challenges
- Achievement badges
- Streaks and milestones
- Special event predictions

---

## Technical Architecture Goals

### Widget Architecture
- **Isolated**: Each widget = own context, can't interfere with host page
- **Sandboxed**: Shadow DOM for style isolation
- **Lightweight**: <50KB gzipped core bundle
- **Fast**: <100ms initial render
- **Offline-capable**: IndexedDB caching
- **Accessible**: WCAG 2.1 AA compliant

### Data Flow
```
User API Key → Provider → Transform → Cache (IndexedDB) → Render
                                    ↓
                              Predictions → Profile Stats → Widgets
```

### Performance Targets
- **First Load**: <1s to interactive
- **Cache Hit**: <100ms render
- **API Request**: Cached for 5min (configurable)
- **Prediction Submission**: <200ms save
- **Widget Update**: <50ms re-render

### Browser Support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

---

## Future Ideas (Parking Lot)

### Advanced Features
- **Live Score Updates**: WebSocket integration
- **Push Notifications**: Prediction reminders, results
- **Machine Learning**: AI prediction suggestions based on history
- **Betting Odds Integration**: Compare predictions to bookmaker odds
- **Historical Analysis**: "How would this prediction have done in past seasons?"
- **Video Integration**: Embed prediction videos alongside stats
- **Voice Predictions**: Record audio predictions
- **Team/Player Stats**: Deep-dive analytics
- **Fantasy League Integration**: Sync with FPL data
- **Multi-League Predictions**: Predict across multiple leagues
- **Bracket Predictions**: For tournament/playoff formats

### Business Model

**Free Tier (Self-Hosted)**
- Open source widget code
- Bring your own API keys
- Host on your own infrastructure
- Full feature access
- Community support

**Hosted Tier - $10/month per league**
Perfect for:
- Youth leagues (U6, U8, U10, etc.)
- Amateur adult leagues
- Small sports organizations
- Anyone who doesn't want to manage hosting

Includes:
- Professional UI matching the big leagues
- Managed hosting (no technical setup)
- Automatic updates
- Data entry interface (CSV/Google Sheets)
- Custom league branding (colors, logos)
- Prediction system for parents/fans
- Mobile-friendly responsive design
- SSL certificate & custom domain support
- Email support

**Example Use Cases:**
- "Riverside Youth Soccer League U10" gets the same sleek table as "EFL Championship"
- Parents can make predictions on their kids' games
- League admin uploads results via spreadsheet
- Widget embeds on league website, team pages, Discord servers
- Kids see themselves on a "pro" leaderboard

**Enterprise (Custom Pricing)**
- Multiple leagues under one account
- White-label (remove UltraTable branding)
- Priority support
- Custom integrations
- Dedicated instance
- SLA guarantees

### Platform Expansion
- WordPress plugin
- Shopify app
- Discord bot
- Slack integration
- Mobile app (React Native)

---

## Success Metrics

### MVP Success (Phase 2)
- 10 active predictor profiles
- 100+ predictions submitted
- Widget embedded on 3+ sites
- <2s average load time
- 95%+ test coverage

### Growth Success (Phase 3-4)
- 100+ active predictors
- 5,000+ predictions per gameweek
- 50+ widget embeds
- 3+ data providers integrated
- Featured on sports content creator channels

### Platform Success (Phase 5-6)
- 1,000+ predictors
- 100,000+ predictions total
- 500+ embeds
- Self-hosted by 10+ organizations
- Community leaderboards active
- Prediction pools created

---

## Development Principles

1. **Widget-First**: Every feature should work embedded
2. **User Data Privacy**: Users own their API keys and predictions
3. **Performance**: Fast load times, aggressive caching
4. **Accessibility**: Keyboard navigation, screen readers
5. **Testing**: Maintain >95% test coverage
6. **Documentation**: Clear examples, API docs, video tutorials
7. **Open Architecture**: Easy to extend, plugin system
8. **No Vendor Lock-in**: Users can export their data anytime

---

## Current Focus

**Immediate Next Steps:**
1. Verify EFL Championship integration works
2. Build prediction submission UI
3. Create predictor profile system
4. Implement scoring algorithm
5. Design head-to-head comparison view
6. Create basic stream banner widget

**Timeline (Rough):**
- **Phase 1**: ✅ Complete
- **Phase 2**: 2-3 weeks (Prediction system core)
- **Phase 3**: 1-2 weeks (Stream widgets)
- **Phase 4**: 2-3 weeks (Multi-provider)
- **Phase 5**: 2-3 weeks (Config/embed)
- **Phase 6**: Ongoing (Community features)

---

*Last Updated: 2026-02-15*
