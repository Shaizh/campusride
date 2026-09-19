# CampusRide

Smart campus ride-sharing platform for students to find, publish, book, track, and manage shared rides.

## Overview

CampusRide is a campus-focused ride-sharing platform that connects students who need a ride with students who are offering rides. The platform supports ride discovery, booking, payments, tracking, communication, ratings, complaints, notifications, analytics, and administration.

## Features

### Passenger
- Search available rides
- Search by pickup and destination
- View ride details and available seats
- Book rides
- Payment and receipts
- Track active rides
- Message riders
- Rate completed rides
- Submit complaints
- Cancel bookings
- Save rides
- View notifications
- Travel analytics

### Rider
- Publish rides
- Select pickup and destination locations
- Manage rides
- Accept or reject booking requests
- Manage ride status
- View passenger information
- View earnings and analytics
- Communicate with passengers
- Receive notifications
- Manage rider subscriptions
- View ratings

### Safety and Trust
- Passenger and rider ratings
- Complaint reporting
- Ride communication
- Booking notifications
- Ride status notifications
- Payment receipts

### Payments
- Razorpay integration
- Online checkout
- UPI payment support
- Payment verification
- Payment receipts
- Rider subscription checkout

### Location and Tracking
- Google Maps integration
- Pickup and destination selection
- Ride location visualization
- Active ride tracking
- Vehicle location tracking

### Communication
- Passenger-rider chat
- Live ride messaging
- Call rider option

### Notifications
- New ride offers
- Booking requests
- Booking status updates
- Ride status updates
- Payment and fare receipts

### Analytics
- Passenger travel analytics
- Rider ride analytics
- Earnings information
- Ride history
- Performance statistics
- Rating information

### Admin
- Admin dashboard
- Ride management
- Booking management
- User management
- Complaint monitoring
- System analytics

## Technology Stack

- React
- TypeScript
- Vite
- Node.js
- Express.js
- Firebase
- Firebase Admin
- Google Maps
- Razorpay
- Google Gemini API
- Tailwind CSS
- Recharts
- Lucide React
- Motion
- Capacitor

## System Modules

```text
CampusRide
├── Passenger
│   ├── Search Rides
│   ├── Book Ride
│   ├── Payment
│   ├── Track Ride
│   ├── Chat
│   ├── Ratings
│   └── Complaints
├── Rider
│   ├── Publish Ride
│   ├── Booking Requests
│   ├── Ride Management
│   ├── Earnings
│   ├── Analytics
│   └── Ratings
├── Admin
│   ├── Dashboard
│   ├── Ride Management
│   ├── User Management
│   ├── Complaint Monitoring
│   └── Analytics
└── Services
    ├── Firebase
    ├── Google Maps
    ├── Razorpay
    ├── Gemini AI
    └── Notifications
```

## Installation

### Prerequisites

- Node.js
- npm
- Git

### Clone the repository

```bash
git clone https://github.com/Shaizh/campusride.git
cd campusride
```

### Install dependencies

```bash
npm install
```

### Environment configuration

Create a `.env.local` file and add the required API configuration.

```env
GEMINI_API_KEY=your_gemini_api_key
```

Never commit API keys or private credentials to GitHub.

### Run locally

```bash
npm run dev
```

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run clean
```

## Security

The following files are excluded from version control:

```text
.env*
firebase-applet-config.json
src/data/server_db.json
```

Do not commit API keys, authentication credentials, private Firebase configuration, or personal database information.

## Mobile Support

CampusRide includes Capacitor support for extending the project to mobile platforms.

## Future Enhancements

- Real-time GPS tracking
- Automated ride matching
- Route optimization
- Emergency/SOS functionality
- Push notifications
- Advanced fraud detection
- AI-based ride recommendations
- Campus transportation analytics
- Dedicated Android and iOS applications
- Expanded payment options

## Screenshots

Application screenshots can be added to a `screenshots/` directory.

## Project

**CampusRide**  
Smart campus ride-sharing platform developed as an academic project.

### Developer

**Mohammed Shaiz**  
Bachelor of Computer Applications  
Artificial Intelligence, Machine Learning and Cloud Computing

## License

This project is developed for academic and educational purposes.
