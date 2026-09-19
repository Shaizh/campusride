import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileText, Camera, User, ArrowRight, ArrowLeft, Smartphone, RefreshCw, Lock } from 'lucide-react';
import { COLLEGES, STATES_OF_INDIA } from '../data/colleges';
import { isValidCollegeEmail, ALLOWED_DOMAINS, registerUser } from '../data/db';
import { validatePasswordStrength } from '../lib/validation';
import { User as UserType } from '../types';

// Compress/resize uploaded student identification pictures to stay under Firestore document size limits (max 1MB per document)
function compressBase64Image(base64Str: string, maxWidth = 320, maxHeight = 320, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = base64Str;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(base64Str);
        }
      } catch (err) {
        console.warn('Failed to compress base64 image on canvas:', err);
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

interface RegistrationFlowProps {
  initialRole: 'passenger' | 'rider';
  onSuccess: (verifiedUser: UserType) => void;
  onCancel: () => void;
}

export default function RegistrationFlow({ initialRole, onSuccess, onCancel }: RegistrationFlowProps) {
  const [step, setStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [role, setRole] = useState<'passenger' | 'rider'>(initialRole);
  
  // Terms & policy check conditions
  const [agreedGeneral, setAgreedGeneral] = useState(false);
  const [agreedRoleTerms, setAgreedRoleTerms] = useState(false);
  
  // Credentials state
  const [formData, setFormData] = useState({
    fullName: '',
    collegeName: COLLEGES[0]?.name || '',
    phoneNumber: '',
    email: '',
    password: '',
    vehicleName: '',
    vehiclePlate: '',
  });

  // Verification Upload states (saving base64 mocks or preset placeholders)
  const [idFront, setIdFront] = useState<string | null>(null);
  const [idBack, setIdBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState('Karnataka');
  const [selectedArea, setSelectedArea] = useState('Mangalore');

  // Filtered lists
  const availableAreas = Array.from(new Set(COLLEGES.filter(c => c.state === selectedState).map(c => c.area)));
  const filteredColleges = COLLEGES.filter(c => c.state === selectedState && (selectedArea === 'All' || c.area === selectedArea) && c.type === 'college');

  useEffect(() => {
    if (availableAreas.length > 0) {
      if (!availableAreas.includes(selectedArea)) {
        setSelectedArea(availableAreas[0]);
      }
    }
  }, [selectedState]);

  useEffect(() => {
    if (filteredColleges.length > 0) {
      const currentExistsInFiltered = filteredColleges.some(c => c.name === formData.collegeName);
      if (!currentExistsInFiltered) {
        setFormData(prev => ({ ...prev, collegeName: filteredColleges[0].name }));
      }
    } else {
      const stateColleges = COLLEGES.filter(c => c.state === selectedState && c.type === 'college');
      if (stateColleges.length > 0) {
        const alreadyMatches = stateColleges.some(c => c.name === formData.collegeName);
        if (!alreadyMatches) {
          setFormData(prev => ({ ...prev, collegeName: stateColleges[0].name }));
        }
      }
    }
  }, [selectedState, selectedArea]);

  // Errors management
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [generalError, setGeneralError] = useState('');

  // Registration OTP states
  const [regGeneratedOtp, setRegGeneratedOtp] = useState('');
  const [regUserOtpInput, setRegUserOtpInput] = useState('');
  const [regOtpError, setRegOtpError] = useState('');

  // Built-in presets for fast demo signup
  const PRESET_MOCK_VERIFICATIONS = {
    front: 'https://images.unsplash.com/photo-1554774853-719586f82d77?w=400&auto=format&fit=crop&q=80',
    back: 'https://images.unsplash.com/photo-1554774853-719586f82d77?w=400&auto=format&fit=crop&q=80',
    selfie: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'email') {
      if (value && !isValidCollegeEmail(value)) {
        setEmailError(`Please enter a valid personal or college email address (e.g., student@gmail.com).`);
      } else {
        setEmailError('');
      }
    }

    if (name === 'phoneNumber') {
      const digitsOnly = value.replace(/\D/g, '');
      if (value && digitsOnly.length !== 10) {
        setPhoneError('enter valid phone number');
      } else {
        setPhoneError('');
      }
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      // Validate Step 1
      if (!formData.fullName || !formData.email || !formData.phoneNumber || !formData.password) {
        setGeneralError('Please fill out all personal credentials including a secure password.');
        return;
      }
      const digitsOnly = formData.phoneNumber.replace(/\D/g, '');
      if (digitsOnly.length !== 10) {
        setGeneralError('enter valid phone number');
        return;
      }
      if (role === 'rider' && (!formData.vehicleName.trim() || !formData.vehiclePlate.trim())) {
        setGeneralError('Please enter your vehicle name and registration plate number to register as a Rider.');
        return;
      }
      const pwdCheck = validatePasswordStrength(formData.password);
      if (!pwdCheck.isValid) {
        setGeneralError(pwdCheck.message);
        return;
      }
      if (emailError || !isValidCollegeEmail(formData.email)) {
        setGeneralError('Please provide a valid personal or college email address to proceed.');
        return;
      }
      setGeneralError('');
      setStep(2);
    }
  };

  const loadDemoVerification = () => {
    setIdFront(PRESET_MOCK_VERIFICATIONS.front);
    setIdBack(PRESET_MOCK_VERIFICATIONS.back);
    setSelfie(PRESET_MOCK_VERIFICATIONS.selfie);
  };

  const handleSubmitRegistration = async () => {
    if (!formData.fullName || !formData.email || !formData.phoneNumber || !formData.password) {
      setGeneralError('Please fill out all personal credentials.');
      return;
    }

    const digitsOnly = formData.phoneNumber.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      setGeneralError('enter valid phone number');
      return;
    }

    if (!idFront || !idBack || !selfie) {
      setGeneralError('Student identity verification requires uploading ID front, ID back, and selfie.');
      return;
    }

    if (!agreedGeneral) {
      setGeneralError('You must agree to the Privacy Policy and Terms & Conditions.');
      return;
    }

    if (!agreedRoleTerms) {
      setGeneralError(`You must read and agree to the CampusRide ${role === 'rider' ? 'Rider' : 'Passenger'} Terms & Conditions.`);
      return;
    }

    setGeneralError('');
    setIsRegistering(true);
    try {
      // Complete Registration locally without requiring step 3 OTP verification
      const registered = await registerUser(
        {
          fullName: formData.fullName,
          email: formData.email,
          role: role,
          collegeName: formData.collegeName,
          state: selectedState,
          city: selectedArea,
          phoneNumber: formData.phoneNumber,
          password: formData.password,
          ...(role === 'rider' ? {
            vehicleName: formData.vehicleName,
            vehiclePlate: formData.vehiclePlate,
          } : {})
        },
        idFront,
        idBack,
        selfie
      );

      setIsSubmitted(true);
    } catch (err: any) {
      setGeneralError(err.message || 'Registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleVerifyAndFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedGeneral) {
      setRegOtpError('You must agree to the Privacy Policy and Terms & Conditions.');
      return;
    }

    if (!agreedRoleTerms) {
      setRegOtpError(`You must read and agree to the CampusRide ${role === 'rider' ? 'Rider' : 'Passenger'} Terms & Conditions.`);
      return;
    }

    if (!regUserOtpInput.trim()) {
      setRegOtpError('Please enter the 6-digit verification code.');
      return;
    }

    if (regUserOtpInput.trim() !== regGeneratedOtp) {
      setRegOtpError('Invalid verification code. Please enter the correct simulated OTP.');
      return;
    }

    setRegOtpError('');
    setIsRegistering(true);
    try {
      // Complete Registration locally
      const registered = await registerUser(
        {
          fullName: formData.fullName,
          email: formData.email,
          role: role,
          collegeName: formData.collegeName,
          state: selectedState,
          city: selectedArea,
          phoneNumber: formData.phoneNumber,
          password: formData.password,
          ...(role === 'rider' ? {
            vehicleName: formData.vehicleName,
            vehiclePlate: formData.vehiclePlate,
          } : {})
        },
        idFront,
        idBack,
        selfie
      );

      setIsSubmitted(true);
    } catch (err: any) {
      setRegOtpError(err.message || 'Registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleResendRegOtp = () => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setRegGeneratedOtp(otp);
    setRegUserOtpInput('');
    setRegOtpError('');
    console.log(`[SECURE SMS/EMAIL SIGNUP RELAY RESEND] New Registration OTP is: ${otp}`);
  };

  // Real File upload processor
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back' | 'selfie') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        compressBase64Image(base64).then(compressed => {
          if (type === 'front') {
            setIdFront(compressed);
          } else if (type === 'back') {
            setIdBack(compressed);
          } else {
            setSelfie(compressed);
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, type: 'front' | 'back' | 'selfie') => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        compressBase64Image(base64).then(compressed => {
          if (type === 'front') {
            setIdFront(compressed);
          } else if (type === 'back') {
            setIdBack(compressed);
          } else {
            setSelfie(compressed);
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Drag and drop / file load simulator fallback
  const simulateFileUpload = (type: 'front' | 'back' | 'selfie') => {
    let mockUrl = '';
    if (type === 'front') {
      mockUrl = PRESET_MOCK_VERIFICATIONS.front;
      setIdFront(mockUrl);
    } else if (type === 'back') {
      mockUrl = PRESET_MOCK_VERIFICATIONS.back;
      setIdBack(mockUrl);
    } else {
      mockUrl = PRESET_MOCK_VERIFICATIONS.selfie;
      setSelfie(mockUrl);
    }
  };

  if (isSubmitted) {
    return (
      <div id="registration-flow-card" className="max-w-xl mx-auto glass-panel rounded-3xl overflow-hidden shadow-2xl my-8">
        {/* Title banner */}
        <div className="bg-slate-950 p-6 border-b border-slate-800 text-center">
          <h2 className="text-xl font-bold text-white uppercase tracking-tight">Join CampusRide</h2>
          <p className="text-xs text-slate-400 mt-1">"Smart Rides for Smart Students" – exclusive college network</p>
        </div>

        <div className="p-6 md:p-8 text-center space-y-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center animate-pulse">
              <RefreshCw className="w-8 h-8 text-[#00C896] animate-spin" style={{ animationDuration: '4s' }} />
            </div>
            
            <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] tracking-widest uppercase font-bold font-mono px-3 py-1 rounded-full">
              Verification State: Request Submitted
            </span>
          </div>

          <div className="space-y-3 max-w-md mx-auto">
            <h3 className="text-base font-extrabold text-white uppercase tracking-tight">
              Application Under Review
            </h3>
            <p className="text-sm font-semibold text-slate-300 leading-relaxed">
              waiting for the admin to accept the request
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              We have dispatched your identity files (ID Front, Back and live selfie) to our portal for super-admin verification. You will be able to log in securely with your credentials once the admin accepts your request.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-900">
            <button
              onClick={onCancel}
              id="registration-success-done-btn"
              className="w-full bg-[#00C896] text-[#0f172a] hover:bg-emerald-400 py-3 rounded-xl font-bold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Return to Login</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="registration-flow-card" className="max-w-xl mx-auto glass-panel rounded-3xl overflow-hidden shadow-2xl my-8">
      {/* Title banner */}
      <div className="bg-slate-950 p-6 border-b border-slate-800 text-center relative">
        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] tracking-widest uppercase font-bold font-mono px-2.5 py-1 rounded-full inline-block mb-2">
          Step {step} of 2 - {role === 'rider' ? 'Rider' : 'Passenger'} Verification
        </span>
        <h2 className="text-xl font-bold text-white uppercase tracking-tight">Join CampusRide</h2>
        <p className="text-xs text-slate-400 mt-1">"Smart Rides for Smart Students" – exclusive college network</p>

        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-xs text-slate-400 hover:text-white border border-slate-850 bg-slate-900/50 hover:bg-slate-900 px-2.5 py-1 rounded-lg transition"
        >
          Cancel
        </button>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {generalError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col gap-3 text-xs text-red-00">
            <div className="flex items-start gap-2.5 text-red-400">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <span>{generalError}</span>
            </div>
            {generalError.toLowerCase().includes('operation-not-allowed') && (
              <div className="p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-slate-350 space-y-2.5 text-xs">
                <p className="font-bold text-amber-400 text-sm flex items-center gap-1.5">
                  <span>⚠️</span> Firebase Email/Password Auth Disabled
                </p>
                <p>This application relies on Firebase Authentication to securely register and manage student accounts. Currently, the <strong>Email/Password</strong> sign-in method is not enabled in your Firebase Console.</p>
                <p className="font-semibold text-white">How to fix this issue:</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-slate-400">
                  <li>
                    Open the{' '}
                    <a
                      href="https://console.firebase.google.com/project/intricate-grove-rszp9/authentication/providers"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-emerald-400 font-bold underline transition inline-flex items-center gap-1 cursor-pointer"
                    >
                      Firebase Console Settings Page
                    </a>
                  </li>
                  <li>Click on <strong>"Add new provider"</strong>.</li>
                  <li>Select <strong>"Email/Password"</strong> from the list.</li>
                  <li>Toggle the <strong>"Email/Password"</strong> switch to <strong>Enable</strong>, and click <strong>"Save"</strong>.</li>
                </ol>
                <div className="pt-1.5 border-t border-amber-500/10 text-[10.5px] text-slate-450 leading-relaxed italic">
                  Once enabled, student registration and login will work instantly!
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 1: Basic credentials */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setRole('passenger')}
                className={`py-2 text-xs font-bold rounded-lg transition uppercase tracking-wider cursor-pointer ${
                  role === 'passenger' ? 'bg-[#2563EB] text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Passenger Sign Up
              </button>
              <button
                type="button"
                onClick={() => setRole('rider')}
                className={`py-2 text-xs font-bold rounded-lg transition uppercase tracking-wider cursor-pointer ${
                  role === 'rider' ? 'bg-[#00C896] text-[#0f172a] shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Rider Sign Up
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-500" />
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleTextChange}
                    placeholder="Enter full name"
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Select State</label>
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    {STATES_OF_INDIA.map((st) => (
                      <option key={st.name} value={st.name}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Select City/Area</label>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    {availableAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">College or University</label>
                  <select
                    name="collegeName"
                    value={formData.collegeName}
                    onChange={handleTextChange}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    {filteredColleges.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    {filteredColleges.length === 0 && (
                      <option value="">No colleges in state</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleTextChange}
                  placeholder="10-digit mobile number"
                  className={`w-full bg-slate-950 border text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none placeholder-slate-500 ${
                    phoneError ? 'border-red-500 focus:border-red-500' : 'border-slate-800 focus:border-emerald-500'
                  }`}
                />
                {phoneError && (
                  <p className="text-[10px] text-red-400 mt-1.5 font-semibold font-mono">{phoneError}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Create Secure Password</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleTextChange}
                  placeholder="8+ chars, 1 capital, 1 number, 1 special char"
                  className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                />
                {formData.password && (
                  <div className="mt-2 grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/40">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`transition-colors duration-200 ${formData.password.length >= 8 ? "text-emerald-400 font-semibold" : "text-slate-500 font-medium"}`}>
                        {formData.password.length >= 8 ? "✓" : "○"} At least 8 characters
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`transition-colors duration-200 ${/[A-Z]/.test(formData.password) ? "text-emerald-400 font-semibold" : "text-slate-500 font-medium"}`}>
                        {/[A-Z]/.test(formData.password) ? "✓" : "○"} 1 capital letter
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`transition-colors duration-200 ${/[0-9]/.test(formData.password) ? "text-emerald-400 font-semibold" : "text-slate-500 font-medium"}`}>
                        {/[0-9]/.test(formData.password) ? "✓" : "○"} At least 1 number
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`transition-colors duration-200 ${/[^a-zA-Z0-9]/.test(formData.password) ? "text-emerald-400 font-semibold" : "text-slate-500 font-medium"}`}>
                        {/[^a-zA-Z0-9]/.test(formData.password) ? "✓" : "○"} 1 special char
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {role === 'rider' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                <div>
                  <label className="text-[11px] font-bold text-[#00C896] uppercase tracking-wider mb-1.5 block">Vehicle Model / Name</label>
                  <input
                    type="text"
                    name="vehicleName"
                    value={formData.vehicleName}
                    onChange={handleTextChange}
                    placeholder="e.g. Honda Activa 6G, KTM Duke, etc."
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#00C896] uppercase tracking-wider mb-1.5 block">Registration Plate Number</label>
                  <input
                    type="text"
                    name="vehiclePlate"
                    value={formData.vehiclePlate}
                    onChange={handleTextChange}
                    placeholder="e.g. KA-19-HE-4512"
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-500 uppercase"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Email Address (Personal or College)</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleTextChange}
                  placeholder="e.g. student@gmail.com, candidate@yahoo.com"
                  className="w-full bg-slate-950 border border-slate-800 text-white text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                />
                {emailError ? (
                  <p className="text-[10px] text-amber-400 mt-1.5 leading-relaxed">{emailError}</p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1.5 block">
                    You can use any <strong className="text-emerald-400">personal email</strong> (Gmail, Yahoo, etc.) or a college domain.
                  </p>
                )}
              </div>
            </div>

            {/* Verification Documents Upload Option */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">College ID & Photo Verification</label>
                </div>
                <button
                  type="button"
                  onClick={loadDemoVerification}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/35 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer"
                >
                  Auto-fill IDs
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* ID Front */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold text-center">ID Card Front</span>
                  <input
                    type="file"
                    id="id-front-upload-main"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, 'front')}
                  />
                  <label
                    htmlFor="id-front-upload-main"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'front')}
                    className="w-full h-32 border border-dashed border-slate-850 hover:border-emerald-500 bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden p-2 group transition relative"
                  >
                    {idFront ? (
                      <div className="relative w-full h-full group">
                        <img src={idFront} alt="ID Front" className="w-full h-full object-cover rounded-xl" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-bold">
                          <Upload className="w-4 h-4 text-emerald-400 mb-1" />
                          <span>Replace Front ID</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition" />
                        <span className="text-[10px] text-slate-400 group-hover:text-white mt-1">Upload Front ID</span>
                        <span className="text-[8px] text-slate-550 italic text-center">Click or Drag & Drop</span>
                      </>
                    )}
                  </label>
                </div>

                {/* ID Back */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold text-center">ID Card Back</span>
                  <input
                    type="file"
                    id="id-back-upload-main"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, 'back')}
                  />
                  <label
                    htmlFor="id-back-upload-main"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'back')}
                    className="w-full h-32 border border-dashed border-slate-850 hover:border-emerald-500 bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden p-2 group transition relative"
                  >
                    {idBack ? (
                      <div className="relative w-full h-full group">
                        <img src={idBack} alt="ID Back" className="w-full h-full object-cover rounded-xl" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-bold">
                          <FileText className="w-4 h-4 text-emerald-400 mb-1" />
                          <span>Replace Back ID</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <FileText className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition" />
                        <span className="text-[10px] text-slate-400 group-hover:text-white mt-1">Upload Back ID</span>
                        <span className="text-[8px] text-slate-550 italic text-center">Click or Drag & Drop</span>
                      </>
                    )}
                  </label>
                </div>

                {/* Selfie */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold text-center">Selfie with ID</span>
                  <input
                    type="file"
                    id="selfie-upload-main"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, 'selfie')}
                  />
                  <label
                    htmlFor="selfie-upload-main"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'selfie')}
                    className="w-full h-32 border border-dashed border-slate-850 hover:border-emerald-500 bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden p-2 group transition relative"
                  >
                    {selfie ? (
                      <div className="relative w-full h-full group">
                        <img src={selfie} alt="Selfie" className="w-full h-full object-cover rounded-xl" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-bold">
                          <Camera className="w-4 h-4 text-emerald-400 mb-1" />
                          <span>Replace Selfie</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition" />
                        <span className="text-[10px] text-slate-400 group-hover:text-white mt-1">Upload Selfie</span>
                        <span className="text-[8px] text-slate-550 italic text-center">Click or Drag & Drop</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>

            {/* Legal compliance forms */}
            <div className="space-y-4 pt-6 border-t border-slate-900 mt-6">
              {/* Checkbox A: General Privacy & Terms */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-900 hover:border-slate-800 transition cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedGeneral}
                  onChange={(e) => setAgreedGeneral(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-emerald-500 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500"
                />
                <span className="text-[11px] font-semibold text-slate-300 leading-snug">
                  I agree to the{" "}
                  <a
                    href="https://sites.google.com/view/campusride-privacypolicy/home"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline font-bold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Privacy Policy
                  </a>{" "}
                  and{" "}
                  <span className="text-emerald-400 underline font-semibold">
                    Terms & Conditions
                  </span>
                </span>
              </label>

              {/* Role-specific Terms of Service Panel */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-900 space-y-3.5">
                <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                  <span className="w-1.5 h-3 bg-sky-500 rounded-full"></span>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    CAMPUSRIDE TERMS OF SERVICE
                  </h4>
                </div>

                {role === 'passenger' ? (
                  <div className="space-y-2 text-[11px] text-slate-400 leading-normal">
                    <p className="font-extrabold text-slate-200">As a Passenger, I agree to:</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      <li>Treat riders with respect and behave responsibly.</li>
                      <li>Provide accurate information while using CampusRide.</li>
                      <li>Follow all applicable laws and college regulations.</li>
                      <li className="text-slate-500 italic mt-1">Understand that CampusRide only connects students and is not responsible for personal disputes, delays, accidents, or losses arising from rides.</li>
                    </ul>
                  </div>
                ) : (
                  <div className="space-y-2 text-[11px] text-slate-400 leading-normal">
                    <p className="font-extrabold text-[#00C896]">As a Rider, I agree to:</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      <li>Treat passengers respectfully and maintain appropriate conduct.</li>
                      <li>Possess a valid driving license and all legally required vehicle documents.</li>
                      <li>Ensure that the information provided to CampusRide is accurate.</li>
                      <li>Comply with all traffic laws and safety regulations.</li>
                      <li>Understand that any false information or invalid documents may lead to account suspension or removal.</li>
                      <li className="text-emerald-500/70 italic mt-1">Acknowledge that CampusRide only provides a platform connecting students and is not liable for accidents, legal violations, disputes, or damages resulting from rides.</li>
                    </ul>
                  </div>
                )}

                <label className="flex items-start gap-2.5 pt-2.5 border-t border-slate-900 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedRoleTerms}
                    onChange={(e) => setAgreedRoleTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-500 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500"
                  />
                  <span className="text-[10.5px] font-bold text-slate-350 leading-snug">
                    I have read and agree to the CampusRide Terms & Conditions and{" "}
                    <a
                      href="https://sites.google.com/view/campusride-privacypolicy/home"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>.
                  </span>
                </label>
              </div>
            </div>

            {/* Complete Registration Action */}
            <button
              onClick={handleSubmitRegistration}
              disabled={isRegistering}
              className="w-full bg-[#00C896] text-[#0f172a] hover:bg-emerald-400 py-3 rounded-xl font-bold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 mt-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRegistering ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending Request...</span>
                </>
              ) : (
                <>
                  <span>Send Request</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 2: Identity & student verification uploads */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-indigo-300">Mandatory Verification Guard</h4>
                <p className="text-[10px] text-indigo-200 mt-0.5 leading-relaxed">
                  To ensure 100% safety on student transit, please upload front, back layouts of your college ID Card and a live selfie. Click elements to instantly load default mock files or attach values.
                </p>
              </div>
            </div>

            {/* Quick prefill trigger */}
            <div className="flex justify-between items-center bg-slate-950 px-4 py-2 border border-slate-850 rounded-xl">
              <span className="text-[10.5px] text-slate-400">Want to test quickly with verified mock IDs?</span>
              <button
                type="button"
                onClick={loadDemoVerification}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                Auto-fill IDs
              </button>
            </div>

            {/* Verification layout grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* ID Front */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold text-center">ID Card Front</span>
                <input
                  type="file"
                  id="id-front-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'front')}
                />
                <label
                  htmlFor="id-front-upload"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'front')}
                  className="w-full h-32 border border-dashed border-slate-850 hover:border-emerald-500 bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden p-2 group transition relative"
                >
                  {idFront ? (
                    <div className="relative w-full h-full group">
                      <img src={idFront} alt="ID Front" className="w-full h-full object-cover rounded-xl" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-bold">
                        <Upload className="w-4 h-4 text-emerald-400 mb-1" />
                        <span>Replace Front ID</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition" />
                      <span className="text-[10px] text-slate-400 group-hover:text-white mt-1.5 font-medium font-mono text-center">
                        Upload Front ID
                      </span>
                      <span className="text-[8px] text-slate-500 mt-0.5 text-center px-2">Click or Drag & Drop</span>
                    </>
                  )}
                </label>
              </div>

              {/* ID Back */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold text-center">ID Card Back</span>
                <input
                  type="file"
                  id="id-back-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'back')}
                />
                <label
                  htmlFor="id-back-upload"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'back')}
                  className="w-full h-32 border border-dashed border-slate-850 hover:border-emerald-500 bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden p-2 group transition relative"
                >
                  {idBack ? (
                    <div className="relative w-full h-full group">
                      <img src={idBack} alt="ID Back" className="w-full h-full object-cover rounded-xl" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-bold">
                        <FileText className="w-4 h-4 text-emerald-400 mb-1" />
                        <span>Replace Back ID</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <FileText className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition" />
                      <span className="text-[10px] text-slate-400 group-hover:text-white mt-1.5 font-medium font-mono text-center">
                        Upload Back ID
                      </span>
                      <span className="text-[8px] text-slate-500 mt-0.5 text-center px-2">Click or Drag & Drop</span>
                    </>
                  )}
                </label>
              </div>

              {/* Selfie */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold text-center">Selfie with ID</span>
                <input
                  type="file"
                  id="selfie-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, 'selfie')}
                />
                <label
                  htmlFor="selfie-upload"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'selfie')}
                  className="w-full h-32 border border-dashed border-slate-850 hover:border-emerald-500 bg-slate-950/60 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden p-2 group transition relative"
                >
                  {selfie ? (
                    <div className="relative w-full h-full group">
                      <img src={selfie} alt="Selfie" className="w-full h-full object-cover rounded-xl" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-[10px] font-bold">
                        <Camera className="w-4 h-4 text-emerald-400 mb-1" />
                        <span>Replace Selfie</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Camera className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition" />
                      <span className="text-[10px] text-slate-400 group-hover:text-white mt-1.5 font-medium font-mono text-center">
                        Upload Selfie Info
                      </span>
                      <span className="text-[8px] text-slate-550 mt-0.5 text-center px-2">Click or Drag & Drop</span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Legal compliance forms */}
            <div className="space-y-4 pt-6 border-t border-slate-900 mt-6">
              {/* Checkbox A: General Privacy & Terms */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-900 hover:border-slate-800 transition cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedGeneral}
                  onChange={(e) => setAgreedGeneral(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-emerald-500 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500"
                />
                <span className="text-[11px] font-semibold text-slate-300 leading-snug">
                  I agree to the{" "}
                  <a
                    href="https://sites.google.com/view/campusride-privacypolicy/home"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline font-bold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Privacy Policy
                  </a>{" "}
                  and{" "}
                  <span className="text-emerald-400 underline font-semibold">
                    Terms & Conditions
                  </span>
                </span>
              </label>

              {/* Role-specific Terms of Service Panel */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-900 space-y-3.5">
                <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
                  <span className="w-1.5 h-3 bg-sky-500 rounded-full"></span>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    CAMPUSRIDE TERMS OF SERVICE
                  </h4>
                </div>

                {role === 'passenger' ? (
                  <div className="space-y-2 text-[11px] text-slate-400 leading-normal">
                    <p className="font-extrabold text-slate-205">As a Passenger, I agree to:</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      <li>Treat riders with respect and behave responsibly.</li>
                      <li>Provide accurate information while using CampusRide.</li>
                      <li>Follow all applicable laws and college regulations.</li>
                      <li className="text-slate-550 italic mt-1">Understand that CampusRide only connects students and is not responsible for personal disputes, delays, accidents, or losses arising from rides.</li>
                    </ul>
                  </div>
                ) : (
                  <div className="space-y-2 text-[11px] text-slate-400 leading-normal">
                    <p className="font-extrabold text-[#00C896]">As a Rider, I agree to:</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      <li>Treat passengers respectfully and maintain appropriate conduct.</li>
                      <li>Possess a valid driving license and all legally required vehicle documents.</li>
                      <li>Ensure that the information provided to CampusRide is accurate.</li>
                      <li>Comply with all traffic laws and safety regulations.</li>
                      <li>Understand that any false information or invalid documents may lead to account suspension or removal.</li>
                      <li className="text-emerald-500/70 italic mt-1">Acknowledge that CampusRide only provides a platform connecting students and is not liable for accidents, legal violations, disputes, or damages resulting from rides.</li>
                    </ul>
                  </div>
                )}

                <label className="flex items-start gap-2.5 pt-2.5 border-t border-slate-900 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreedRoleTerms}
                    onChange={(e) => setAgreedRoleTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-500 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500"
                  />
                  <span className="text-[10.5px] font-bold text-slate-350 leading-snug">
                    I have read and agree to the CampusRide Terms & Conditions and{" "}
                    <a
                      href="https://sites.google.com/view/campusride-privacypolicy/home"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>.
                  </span>
                </label>
              </div>
            </div>

            {/* Form Action Controls */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setStep(1)}
                className="w-full border border-slate-800 bg-slate-950 hover:bg-slate-900 py-3 rounded-xl font-bold text-xs tracking-wider uppercase transition text-slate-300 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                onClick={handleSubmitRegistration}
                disabled={isRegistering}
                className="w-full bg-[#00C896] text-[#0f172a] hover:bg-emerald-400 py-3 rounded-xl font-bold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegistering ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <span>Complete Signup</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
