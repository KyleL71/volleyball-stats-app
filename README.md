# Volleyball Stats Tracker

A custom web application for tracking volleyball statistics on your Samsung Galaxy Tab A9+ tablet. Works completely offline and allows you to export your stats as CSV files.

## Features

- **Touch-friendly interface** - Large buttons optimized for tablet use
- **Offline functionality** - Works without internet connection
- **Auto-save** - Stats are automatically saved to your device
- **CSV export** - Export your stats to a CSV file for analysis
- **Reset option** - Clear all stats when starting a new game

## How to Use

### Setting Up on Your Tablet

1. **Transfer files to your tablet:**
   - Copy all files (`index.html`, `styles.css`, `app.js`, `manifest.json`) to your tablet
   - You can use USB transfer, cloud storage, or email them to yourself

2. **Open the app:**
   - Open a web browser on your tablet (Chrome, Samsung Internet, etc.)
   - Navigate to the `index.html` file
   - The app will work immediately

3. **Optional - Add to Home Screen (PWA):**
   - In your browser, tap the menu (three dots)
   - Select "Add to Home screen" or "Install app"
   - This creates an app icon on your home screen for easy access

### Using the App

- **Tap any stat cell** to increment that statistic for that player
- **Reset All** button - Clears all stats (with confirmation)
- **Export CSV** button - Downloads your stats as a CSV file

### Stat Categories

- **SERVING**: Good, Ace, Error
- **SERVE/RECEIVE**: 3, 2, 1, 0 (rating scale)
- **ATTACKING**: Attempts, Kills, Error

### Players Included

- ZOE
- AUBREY
- EVELYN
- EMMA
- KARLEA
- BRI
- BRIDGET
- MJ
- LAILA
- BRET

## Offline Support

The app uses browser localStorage to save your stats automatically. Your data persists even if you close the browser or turn off your tablet. Stats are saved locally on your device.

## CSV Export

When you export to CSV, the file will be named with today's date (e.g., `volleyball_stats_2025-01-15.csv`). You can open this file in Excel, Google Sheets, or any spreadsheet application.

## Technical Details

- Pure HTML, CSS, and JavaScript - no dependencies
- Works in any modern web browser
- Responsive design optimized for tablets
- Touch-optimized buttons (minimum 44px touch targets)

## Notes

- Stats are saved automatically as you tap
- The app works best in landscape orientation
- For best results, use Chrome or Samsung Internet browser
