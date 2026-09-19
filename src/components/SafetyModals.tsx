import { useState } from 'react';
import { Star, ShieldAlert, Upload, X, CheckCircle } from 'lucide-react';
import { createReview, submitComplaint } from '../data/db';
import { Ride } from '../types';

interface RatingModalProps {
  ride: Ride;
  passengerId: string;
  passengerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RatingModal({ ride, passengerId, passengerName, onClose, onSuccess }: RatingModalProps) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!reviewText.trim()) {
      setError('Please share your ride feedback details.');
      return;
    }
    createReview(ride.id, ride.riderId, passengerId, passengerName, rating, reviewText);
    onSuccess();
  };

  return (
    <div id="rating-modal-mask" className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel-heavy rounded-3xl w-full max-w-md p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 hover:bg-slate-800 p-1.5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center">
            <Star className="w-6 h-6 fill-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-tight">Rate Student Rider</h3>
            <p className="text-xs text-slate-450 mt-1">Reviewing your ride with <strong className="text-white">{ride.riderName}</strong></p>
          </div>

          {/* Star selector */}
          <div className="flex justify-center items-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                className="transition p-1 cursor-pointer"
              >
                <Star
                  className={`w-8 h-8 ${
                    star <= (hoverRating ?? rating)
                      ? 'fill-amber-400 stroke-amber-400'
                      : 'stroke-slate-650 text-slate-500 fill-transparent'
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="text-left space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Write a Review</label>
            <textarea
              value={reviewText}
              onChange={(e) => {
                setReviewText(e.target.value);
                setError('');
              }}
              rows={3}
              placeholder="How was the journey? punctuality, route choices, safety vibe..."
              className="w-full bg-[#0F172A] border border-slate-800/80 text-white text-xs p-3.5 rounded-xl focus:outline-none focus:border-amber-400 placeholder-slate-500"
            />
            {error && <p className="text-[10px] text-red-400">{error}</p>}
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
          >
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  );
}

interface ComplaintModalProps {
  ride: Ride;
  passengerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ComplaintModal({ ride, passengerId, onClose, onSuccess }: ComplaintModalProps) {
  const [category, setCategory] = useState<any>('unsafe_driving');
  const [explanation, setExplanation] = useState('');
  const [evidenceImg, setEvidenceImg] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSimulateEvidence = () => {
    setEvidenceImg('https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&auto=format&fit=crop&q=80');
  };

  const handleRegister = () => {
    if (!explanation.trim()) {
      setError('Please explain the incidents for safety tracking.');
      return;
    }
    submitComplaint(passengerId, ride.id, category, explanation, evidenceImg || undefined);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="glass-panel-heavy rounded-3xl w-full max-w-md p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-emerald-500/15 text-emerald-400 rounded-full flex items-center justify-center">
            <CheckCircle className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Complaint Registered</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              We have filed this security ticket. Our campus safety council reviews all records. The passenger ride profile will be updated if violations occurred.
            </p>
          </div>
          <button
            onClick={onSuccess}
            className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase cursor-pointer"
          >
            Close Support Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="complaint-modal-mask" className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel-heavy rounded-3xl w-full max-w-md p-6 relative shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 hover:bg-slate-800 p-1.5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer">
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-tight">Security & Safety Report</h3>
              <p className="text-[10px] text-slate-450 leading-tight">Your ride with {ride.riderName} is highly monitored</p>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Issue Category</label>
              <select
                value={category}
                onChange={(e: any) => setCategory(e.target.value)}
                className="w-full bg-[#0F172A] border border-slate-800/80 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-red-500"
              >
                <option value="late_arrival">Late Arrival (Missed Lectures)</option>
                <option value="unsafe_driving">Unsafe / Dangerous Driving</option>
                <option value="misbehavior">Inappropriate / Unsafe Behavior</option>
                <option value="wrong_route">Incorrect route without authorization</option>
                <option value="vehicle_issue">Vehicle issues / unregistered plates</option>
                <option value="other">Other Campus Safety reasons</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Explanation</label>
              <textarea
                value={explanation}
                onChange={(e) => {
                  setExplanation(e.target.value);
                  setError('');
                }}
                rows={4}
                placeholder="Detailed witness explanation of exactly what happened..."
                className="w-full bg-[#0F172A] border border-slate-800/80 text-white text-xs p-3 rounded-xl focus:outline-none focus:border-red-500 placeholder-slate-500"
              />
              {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
            </div>

            {/* Evidence image uploader simulation */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Attach Evidence Image</label>
              <button
                type="button"
                onClick={handleSimulateEvidence}
                className="w-full h-24 border border-dashed border-slate-800/80 hover:border-red-500 bg-[#0F172A]/70 rounded-xl flex flex-col items-center justify-center cursor-pointer overflow-hidden p-2 group transition"
              >
                {evidenceImg ? (
                  <img src={evidenceImg} alt="Evidence block" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-slate-500 group-hover:text-red-400 mb-1" />
                    <span className="text-[10px] text-slate-450 group-hover:text-white">Upload Incident Screen Capture</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <button
            onClick={handleRegister}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
          >
            Submit Safety Complaint
          </button>
        </div>
      </div>
    </div>
  );
}
