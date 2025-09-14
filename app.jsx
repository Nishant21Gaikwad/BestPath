import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut 
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs,
    writeBatch,
    onSnapshot
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyA4cX6oZgdvCZQrrgOTnG6Bb5EVrhi9icw",
    authDomain: "bestpath-e08f8.firebaseapp.com",
    projectId: "bestpath-e08f8",
    storageBucket: "bestpath-e08f8.appspot.com", // Corrected storageBucket format
    messagingSenderId: "971042038627",
    appId: "1:971042038627:web:c7fef3156527e2bfed2956"
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Helper Functions & Data ---

const quizData = {
    id: 'aptitude_v2',
    questions: [
        { text: 'Which subject area energizes you the most?', options: ['Math & Physics', 'Biology & Chemistry', 'History & Social Studies', 'Art & Literature']},
        { text: 'What kind of problems do you enjoy tackling?', options: ['Solving complex logical puzzles', 'Understanding biological systems and healing', 'Analyzing societal trends and past events', 'Creating something new and expressive']},
        { text: 'Which work environment sounds most appealing?', options: ['A fast-paced, collaborative tech office', 'A quiet, focused research lab or library', 'An interactive setting, helping people directly', 'A creative studio or open workshop']},
        { text: 'What is your primary motivator in a career?', options: ['Building innovative products and solutions', 'Financial stability and a clear career ladder', 'Making a direct, positive impact on others', 'Creative freedom and self-expression']},
        { text: 'How do you prefer to learn new things?', options: ['Through structured data and formulas', 'With hands-on experiments and practice', 'Through discussions and debating ideas', 'By observing, imagining, and creating']},
        { text: 'Which activity would you rather do?', options: ['Organize a complex system or plan', 'Nurture a living thing to health', 'Convince a group to support an idea', 'Design a visually appealing poster']},
        { text: 'When facing a challenge, you are more likely to...', options: ['Rely on data and logical reasoning', 'Trust your intuition and past experiences', 'Collaborate with others to find a solution', 'Experiment with unconventional ideas']},
        { text: 'What kind of impact do you want to make?', options: ['Create technology that changes how people live', 'Advance scientific knowledge and discovery', 'Advocate for social justice and change', 'Contribute to culture and the arts']}
    ],
};

const initialColleges = [
    { name: 'IIT Bombay', courses: 'Engineering, Design, Sciences', facilities: 'Labs, Library, Sports Complex', mapLink: 'https://www.google.com/maps/search/?api=1&query=IIT+Bombay' },
    { name: 'AIIMS Delhi', courses: 'Medicine, Nursing, Biotechnology', facilities: 'Hospital, Research Labs, Auditorium', mapLink: 'https://www.google.com/maps/search/?api=1&query=AIIMS+Delhi' },
    { name: 'St. Stephen\'s College, Delhi', courses: 'Humanities, Economics, Sciences', facilities: 'Historic Campus, Library, Cafeteria', mapLink: 'https://www.google.com/maps/search/?api=1&query=St.+Stephen\'s+College,+Delhi' },
    { name: 'IIM Ahmedabad', courses: 'MBA, Executive Education', facilities: 'Case Study Rooms, Library, Student Hostels', mapLink: 'https://www.google.com/maps/search/?api=1&query=IIM+Ahmedabad' },
    { name: 'National Institute of Design', courses: 'Industrial Design, Communication Design', facilities: 'Studios, Workshops, Design Labs', mapLink: 'https://www.google.com/maps/search/?api=1&query=National+Institute+of+Design,+Ahmedabad' },
    { name: 'Jawaharlal Nehru University', courses: 'Social Sciences, International Studies', facilities: 'Vast Campus, Library, Cultural Centers', mapLink: 'https://www.google.com/maps/search/?api=1&query=Jawaharlal+Nehru+University,+Delhi' },
];

// --- Gemini API Integration ---
async function callGeminiAPI(prompt) {
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
        const result = await response.json();
        
        // Robust check for valid API response structure
        if (result && result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
            const jsonText = result.candidates[0].content.parts[0].text;
            return JSON.parse(jsonText);
        } else {
            console.error("Unexpected API response structure:", result);
            return null;
        }
    } catch (error) {
        console.error("Error calling or parsing Gemini API:", error);
        return null;
    }
}

async function generateCareerAdvice(answers) {
    const promptText = `You are an expert career counselor. A student answered a quiz. Analyze their answers to recommend a stream (Science, Commerce, or Arts/Humanities), suggest 4-5 career fields, and provide a short, encouraging explanation. Student's answers: 1. Subject: "${answers[0]}", 2. Problem Style: "${answers[1]}", 3. Environment: "${answers[2]}", 4. Motivator: "${answers[3]}", 5. Learning: "${answers[4]}", 6. Activity: "${answers[5]}", 7. Challenge Approach: "${answers[6]}", 8. Impact: "${answers[7]}". Respond ONLY in JSON: { "stream": "...", "fields": ["...", "..."], "description": "..." }`;
    return callGeminiAPI(promptText);
}

async function getFilteredColleges(recommendation, allColleges) {
    const promptText = `You are a college admissions advisor. A student's recommended stream is "${recommendation.stream}" with interests in "${recommendation.fields.join(', ')}". From the list: ${JSON.stringify(allColleges.map(({id, ...rest}) => rest))}, select suitable colleges and add a "reason" key explaining why it's a good match. Return ONLY a valid JSON array of the filtered colleges with the new "reason" key.`;
    const result = await callGeminiAPI(promptText);
    return result || allColleges;
}

async function generateRoadmap(recommendation) {
    const promptText = `You are an academic planner. For a student recommended the "${recommendation.stream}" stream with interests in "${recommendation.fields.join(', ')}", create a detailed roadmap. Structure it into four stages: High School (Classes 11-12), Entrance Exams, Undergraduate Studies, and Career Preparation. For each stage, provide 2-3 actionable steps. Respond ONLY in JSON format: { "introduction": "...", "stages": [ { "title": "...", "steps": [ { "title": "...", "description": "..." } ] } ] }`;
    return callGeminiAPI(promptText);
}

// --- Icon Components ---
const HomeIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>);
const LibraryIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 6h3v12h-3"/><path d="M12 6h3v12h-3"/><path d="M8 6h3v12H8"/><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4"/></svg>);
const FileQuestionIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M10 10.3c.2-.4.5-.8.9-1a2.1 2.1 0 0 1 2.6.4c.3.4.5.8.5 1.3 0 1.3-2 2-2 2"/><path d="M12 17h.01"/></svg>);
const UserIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
const ChevronRightIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>);
const XIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>);
const GraduationCapIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.084a1 1 0 0 0 0 1.838l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12v5c0 3 4 5 6 5s6-2 6-5v-5"/></svg>);
const TargetIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>);
const BookOpenIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>);
const AlertTriangleIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>);
const MapIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1-3.4 0L12 9.6l-5.9 5.7a2.4 2.4 0 0 1-3.4-3.4l7.6-7.6a2.4 2.4 0 0 1 3.4 0l7.6 7.6a2.4 2.4 0 0 1 0 3.4Z"/><path d="M5 21v-4.5"/><path d="m19 21v-4.5"/></svg>);
const CheckCircleIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>);
const LogOutIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>);
const RocketIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.3.05-3.18-.65-.87-2.14-1.42-3.1-1.01-.84.35-1.52.95-1.95 1.68Z"/><path d="m12 15-3-3 3-3 3 3-3 3Z"/><path d="M9.5 17.5 4.5 22"/><path d="M14.5 12.5 19.5 17.5"/><path d="M17.5 9.5 22 4.5"/><path d="m21.5 2.5-1.9 2.5c-1 1.25-2.5 2-4.1 2H10c-1.6 0-3-1-4.1-2L4 2.5"/></svg>);

// --- UI Components ---
const LoadingSpinner = ({ fullScreen = false }) => (
    <div className={`flex justify-center items-center ${fullScreen ? 'h-screen w-screen' : 'py-4'}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
);

const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md m-4"><div className="flex justify-between items-center p-4 border-b"><h3 className="text-xl font-semibold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><XIcon className="w-6 h-6" /></button></div><div className="p-6">{children}</div></div>
        </div>
    );
};

// --- Page Components ---
const LandingPage = ({ setPage }) => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="p-4 flex justify-between items-center">
             <div className="flex items-center space-x-2">
                <GraduationCapIcon className="w-8 h-8 text-blue-600"/>
                <span className="font-bold text-xl text-gray-800">BestPath</span>
             </div>
            <button onClick={() => setPage('auth')} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">Login</button>
        </header>
        <main className="flex-1 flex flex-col justify-center items-center text-center p-4">
            <h1 className="text-4xl md:text-6xl font-extrabold text-gray-800 mb-4">Find Your Future. Today.</h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">BestPath uses AI to analyze your interests and recommends the perfect career, college, and a personalized roadmap to success.</p>
            <button onClick={() => setPage('auth')} className="bg-green-500 text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-green-600 transition-transform transform hover:scale-105">Get Started for Free</button>
        </main>
    </div>
);

const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuthAction = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    email: userCredential.user.email,
                    name: '',
                    classLevel: '',
                    interests: '',
                    createdAt: new Date(),
                });
            }
        } catch (err) {
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError('');
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const userDocRef = doc(db, 'users', result.user.uid);
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.exists()) {
                 await setDoc(userDocRef, {
                    email: result.user.email,
                    name: result.user.displayName || '',
                    classLevel: '',
                    interests: '',
                    createdAt: new Date(),
                });
            }
        } catch (err) {
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 space-y-6">
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-gray-800">{isLogin ? 'Welcome Back!' : 'Create an Account'}</h2>
                    <p className="text-gray-600">{isLogin ? "Let's find your path." : "Let's get you started."}</p>
                </div>
                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">{error}</div>}
                <form onSubmit={handleAuthAction} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 sr-only">Email address</label>
                        <input id="email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="Email address"/>
                    </div>
                     <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 sr-only">Password</label>
                        <input id="password" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500" placeholder="Password"/>
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400">
                        {loading ? 'Processing...' : (isLogin ? 'Sign in' : 'Sign up')}
                    </button>
                </form>
                <div className="relative flex items-center"><div className="flex-grow border-t border-gray-300"></div><span className="flex-shrink mx-4 text-gray-500">Or continue with</span><div className="flex-grow border-t border-gray-300"></div></div>
                <button onClick={handleGoogleSignIn} disabled={loading} className="w-full flex justify-center items-center space-x-2 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                    <svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.222 0-9.519-3.486-11.188-8.264l-6.571 4.819C9.656 39.663 16.318 44 24 44z"></path><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.011 35.638 44 30.138 44 24c0-1.341-.138-2.65-.389-3.917z"></path></svg>
                    <span>Google</span>
                </button>
                <p className="text-center text-sm text-gray-600">{isLogin ? "Don't have an account?" : "Already have an account?"} <button onClick={() => setIsLogin(!isLogin)} className="font-medium text-blue-600 hover:text-blue-500"> {isLogin ? 'Sign up' : 'Sign in'}</button></p>
            </div>
        </div>
    );
};

const Dashboard = ({ user, userData, setPage }) => {
    const [isProfileModalOpen, setProfileModalOpen] = useState(false);
    
    const recommendation = userData?.geminiRecommendation || { stream: 'Unknown', description: 'Take the quiz for personalized advice!', fields: [] };

    const handleProfileUpdate = async (updatedData) => {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, { ...updatedData }, { merge: true });
        setProfileModalOpen(false);
    };
    
    const ProfileModal = () => {
        const [name, setName] = useState(userData?.name || '');
        const [classLevel, setClassLevel] = useState(userData?.classLevel || '');
        const [interests, setInterests] = useState(userData?.interests || '');

        const handleSubmit = (e) => { e.preventDefault(); handleProfileUpdate({ name, classLevel, interests }); };
        
        return (<Modal isOpen={isProfileModalOpen} onClose={() => setProfileModalOpen(false)} title="Edit Your Profile"><form onSubmit={handleSubmit} className="space-y-4"><div><label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label><input type="text" id="name" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" /></div><div><label htmlFor="class" className="block text-sm font-medium text-gray-700">Class/Grade</label><input type="text" id="class" value={classLevel} onChange={e => setClassLevel(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" /></div><div><label htmlFor="interests" className="block text-sm font-medium text-gray-700">Interests (e.g., Science, Art)</label><textarea id="interests" value={interests} onChange={e => setInterests(e.target.value)} rows="3" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"></textarea></div><div className="flex justify-end pt-2"><button type="button" onClick={() => setProfileModalOpen(false)} className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors mr-2">Cancel</button><button type="submit" className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button></div></form></Modal>);
    }

    return (<div className="p-4 md:p-8"><h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome, {userData?.name || user.email}!</h1><p className="text-gray-600 mb-8">Here's your personalized career and education dashboard.</p><div className="grid grid-cols-1 lg:grid-cols-3 gap-8"><div className="lg:col-span-1 space-y-6"><div className="bg-white p-6 rounded-xl shadow-md"><div className="flex items-center space-x-4 mb-4"><div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center"><UserIcon className="w-8 h-8 text-blue-600" /></div><div><h2 className="text-xl font-bold text-gray-800">{userData?.name || 'Student'}</h2><p className="text-sm text-gray-500">{user.email}</p></div></div><div className="space-y-2 text-sm text-gray-700"><p><strong className="font-medium">Class:</strong> {userData?.classLevel || 'Not set'}</p><p><strong className="font-medium">Interests:</strong> {userData?.interests || 'Not set'}</p></div><button onClick={() => setProfileModalOpen(true)} className="mt-4 w-full bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-200 transition-colors text-sm">Edit Profile</button></div><div className="bg-white p-6 rounded-xl shadow-md"><h3 className="font-bold text-lg mb-4 text-gray-800">Quick Actions</h3><div className="space-y-3"><button onClick={() => setPage('quiz')} className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"><div className="flex items-center"><FileQuestionIcon className="w-5 h-5 text-gray-600 mr-3" /><span className="font-medium text-gray-700">{userData?.quizResults ? 'Retake Quiz' : 'Take Aptitude Quiz'}</span></div><ChevronRightIcon className="w-5 h-5 text-gray-400" /></button><button onClick={() => setPage('roadmap')} className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"><div className="flex items-center"><MapIcon className="w-5 h-5 text-gray-600 mr-3" /><span className="font-medium text-gray-700">View Your Roadmap</span></div><ChevronRightIcon className="w-5 h-5 text-gray-400" /></button><button onClick={() => setPage('colleges')} className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"><div className="flex items-center"><LibraryIcon className="w-5 h-5 text-gray-600 mr-3" /><span className="font-medium text-gray-700">Explore Colleges</span></div><ChevronRightIcon className="w-5 h-5 text-gray-400" /></button></div></div></div><div className="lg:col-span-2"><div className="bg-gradient-to-br from-blue-600 to-green-500 p-8 rounded-xl shadow-lg text-white"><div className="flex items-start space-x-4"><div className="bg-white/20 p-3 rounded-full"><TargetIcon className="w-8 h-8"/></div><div><h2 className="text-2xl font-bold">Your Recommended Stream</h2><p className="text-blue-100 mb-4">{recommendation.description}</p><div className="bg-white/90 text-blue-700 font-bold text-3xl md:text-4xl py-4 px-6 rounded-lg inline-block mb-6">{recommendation.stream}</div>{recommendation.fields && recommendation.fields.length > 0 && (<><h3 className="font-semibold text-lg mb-3">Potential Career Fields:</h3><div className="flex flex-wrap gap-2">{recommendation.fields.map(field => (<span key={field} className="bg-white/20 text-white text-sm font-medium px-3 py-1 rounded-full">{field}</span>))}</div></>)}</div></div></div></div></div><ProfileModal /></div>);
};

const QuizPage = ({ user, setPage }) => {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [quizFinished, setQuizFinished] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAnswer = async (option) => {
        const newAnswers = [...answers, option];
        setAnswers(newAnswers);

        if (currentQuestionIndex < quizData.questions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            setIsProcessing(true);
            const recommendation = await generateCareerAdvice(newAnswers);
            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, {
                quizResults: { quizId: quizData.id, completedAt: new Date(), answers: newAnswers },
                geminiRecommendation: recommendation
            }, { merge: true });
            setIsProcessing(false);
            setQuizFinished(true);
        }
    };

    if (isProcessing) return (<div className="p-4 md:p-8 max-w-2xl mx-auto text-center"><h1 className="text-3xl font-bold text-gray-800 mb-4">Analyzing Your Answers...</h1><p className="text-gray-600 mb-8">Our AI is generating your personalized career advice.</p><LoadingSpinner /></div>);
    if (quizFinished) return (<div className="p-4 md:p-8 max-w-2xl mx-auto text-center"><h1 className="text-3xl font-bold text-gray-800 mb-4">Quiz Completed!</h1><p className="text-gray-600 mb-8">We've updated your profile with your personalized recommendation.</p><button onClick={() => setPage('dashboard')} className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors">View My Recommendation</button></div>);

    const currentQuestion = quizData.questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / quizData.questions.length) * 100;
    
    return (<div className="p-4 md:p-8 max-w-2xl mx-auto"><h1 className="text-3xl font-bold text-gray-800 mb-2">Aptitude & Interest Quiz</h1><p className="text-gray-600 mb-8">Answer a few questions to find your path.</p><div className="bg-white p-6 rounded-xl shadow-md"><div className="mb-6"><div className="flex justify-between items-center mb-2"><span className="text-sm font-medium text-gray-600">Question {currentQuestionIndex + 1} of {quizData.questions.length}</span></div><div className="w-full bg-gray-200 rounded-full h-2.5"><div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div></div></div><h2 className="text-xl font-semibold text-gray-800 mb-6">{currentQuestion.text}</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{currentQuestion.options.map((option, index) => (<button key={index} onClick={() => handleAnswer(option)} className="w-full text-left p-4 bg-gray-50 rounded-lg border-2 border-transparent hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"><span className="font-medium text-gray-700">{option}</span></button>))}</div></div></div>);
};

const CollegesPage = ({ userData, setPage }) => {
    const [colleges, setColleges] = useState([]);
    const [loading, setLoading] = useState(true);
    const recommendation = userData?.geminiRecommendation;

    useEffect(() => {
        const processColleges = async () => {
            setLoading(true);
            try {
                const collegesCollection = collection(db, 'colleges');
                let collegesSnapshot = await getDocs(collegesCollection);
                if (collegesSnapshot.empty) {
                    const batch = writeBatch(db);
                    initialColleges.forEach(college => { batch.set(doc(collection(db, "colleges")), college); });
                    await batch.commit();
                    collegesSnapshot = await getDocs(collegesCollection);
                }
                const allColleges = collegesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (recommendation) {
                    const filtered = await getFilteredColleges(recommendation, allColleges);
                    setColleges(filtered || []); // Ensure colleges is an array even if API returns null
                } else {
                    setColleges([]);
                }
            } catch (error) {
                console.error("Error processing colleges:", error);
                setColleges([]);
            } finally {
                setLoading(false);
            }
        };
        processColleges();
    }, [recommendation]);
    
    const pageTitle = recommendation ? `Top Recommendations for ${recommendation.stream}` : "College Directory";
    const pageDescription = recommendation ? "Our AI has curated this list based on your quiz results." : "Take the quiz to get personalized college recommendations.";

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{pageTitle}</h1>
            <p className="text-gray-600 mb-8">{pageDescription}</p>
            {loading ? <LoadingSpinner /> : recommendation ? (
                colleges.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {colleges.map((college, index) => (
                            <div key={index} className="bg-white rounded-xl shadow-md overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 flex flex-col">
                                <div className="p-6 flex-grow">
                                    <div className="flex items-start space-x-4">
                                        <div className="bg-blue-100 p-3 rounded-lg flex-shrink-0"><BookOpenIcon className="w-6 h-6 text-blue-600" /></div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-800">{college.name}</h3>
                                            <p className="text-sm text-gray-500 mt-1"><strong>Courses:</strong> {college.courses}</p>
                                        </div>
                                    </div>
                                    {college.reason && (<div className="mt-4 p-3 bg-green-50 text-green-800 rounded-lg text-sm"><p><strong className="font-semibold">Why it's a match:</strong> {college.reason}</p></div>)}
                                </div>
                                <div className="p-6 pt-0 mt-auto">
                                    <a href={college.mapLink} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-blue-50 text-blue-700 font-semibold py-2 px-4 rounded-lg hover:bg-blue-100 transition-colors text-sm">View on Map</a>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 bg-white rounded-xl shadow-md">
                        <BookOpenIcon className="w-12 h-12 text-gray-400 mx-auto mb-4"/>
                        <h2 className="text-xl font-semibold text-gray-800">No Specific Recommendations Found</h2>
                        <p className="text-gray-600 mt-2 max-w-md mx-auto">Our AI couldn't find a direct match for your profile in our current directory, but we are always expanding our database.</p>
                    </div>
                )
            ) : (
                <div className="text-center py-16 bg-white rounded-xl shadow-md">
                    <AlertTriangleIcon className="w-12 h-12 text-yellow-500 mx-auto mb-4"/>
                    <h2 className="text-xl font-semibold text-gray-800">Get Your Personalized List</h2>
                    <p className="text-gray-600 mt-2 mb-6 max-w-md mx-auto">Complete the aptitude quiz, and our AI will generate a tailored list of college recommendations just for you.</p>
                    <button onClick={() => setPage('quiz')} className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors">Take the Quiz Now</button>
                </div>
            )}
        </div>
    );
};

const RoadmapPage = ({ userData, setPage }) => {
    const [roadmap, setRoadmap] = useState(null);
    const [loading, setLoading] = useState(true);
    const recommendation = userData?.geminiRecommendation;

    useEffect(() => {
        const fetchRoadmap = async () => {
            if (recommendation) {
                setLoading(true);
                const generatedRoadmap = await generateRoadmap(recommendation);
                setRoadmap(generatedRoadmap);
                setLoading(false);
            } else {
                setLoading(false);
            }
        };
        fetchRoadmap();
    }, [recommendation]);

    const pageTitle = recommendation ? `Your Personalized Roadmap for ${recommendation.stream}` : "Your Career Roadmap";
    const pageDescription = recommendation ? "A step-by-step guide to help you achieve your career goals." : "Take the quiz to generate your personalized career roadmap.";

    return (<div className="p-4 md:p-8"><h1 className="text-3xl font-bold text-gray-800 mb-2">{pageTitle}</h1><p className="text-gray-600 mb-8">{pageDescription}</p>{loading ? <LoadingSpinner /> : roadmap ? (<div className="bg-white p-6 md:p-8 rounded-xl shadow-md"><p className="text-gray-700 mb-8 text-lg">{roadmap.introduction}</p><div className="space-y-8">{roadmap.stages.map((stage, stageIndex) => (<div key={stageIndex} className="relative pl-8"><div className="absolute left-0 top-1 w-px h-full bg-blue-200"></div><div className="absolute left-[-9px] top-0 w-5 h-5 bg-blue-500 rounded-full border-4 border-white"></div><h2 className="text-2xl font-bold text-blue-600 mb-4">{stage.title}</h2><div className="space-y-4">{stage.steps.map((step, stepIndex) => (<div key={stepIndex} className="bg-gray-50 p-4 rounded-lg"><div className="flex items-center"><CheckCircleIcon className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" /><div><h3 className="font-semibold text-gray-800">{step.title}</h3><p className="text-gray-600 text-sm mt-1">{step.description}</p></div></div></div>))}</div></div>))}</div></div>) : (<div className="text-center py-16 bg-white rounded-xl shadow-md"><MapIcon className="w-12 h-12 text-blue-500 mx-auto mb-4"/><h2 className="text-xl font-semibold text-gray-800">Chart Your Path to Success</h2><p className="text-gray-600 mt-2 mb-6 max-w-md mx-auto">Complete the aptitude quiz to unlock a detailed, step-by-step roadmap tailored to your unique strengths and interests.</p><button onClick={() => setPage('quiz')} className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors">Take the Quiz Now</button></div>)}</div>);
};

const JourneyPage = () => {
    const journeyData = [
        {
            title: "The Spark: Initial MVP Request",
            description: "The project began with a clear goal: build a production-quality MVP of a web app called 'One-Stop Career & Education Advisor'. The core tech stack was defined as React, TailwindCSS, and Firebase for a modern, serverless architecture.",
            icon: <TargetIcon className="w-6 h-6 text-white"/>
        },
        {
            title: "Building the Foundation",
            description: "The initial development focused on core features. This involved setting up Firebase Authentication (Email & Google), structuring the Firestore database for users and colleges, and building the essential UI components for the dashboard, quiz, and college directory.",
            icon: <HomeIcon className="w-6 h-6 text-white"/>
        },
        {
            title: "The 'Aha!' Moment: AI Integration",
            description: "The game-changer was integrating Google's Gemini API. The initial rule-based recommendation system was replaced with a dynamic AI engine, transforming the app from a simple tool into a truly intelligent advisor.",
            icon: <GraduationCapIcon className="w-6 h-6 text-white"/>
        },
        {
            title: "Supercharging Features with AI",
            description: "With the AI in place, we rapidly enhanced every feature. The quiz became more diverse and insightful. The college directory became a personalized recommendation list. The most significant addition was the 'Roadmap' feature, providing users with a complete, step-by-step career plan generated by the AI.",
            icon: <RocketIcon className="w-6 h-6 text-white"/>
        },
        {
            title: "Final Polish & Hackathon Prep",
            description: "The final phase involved adding a professional landing page, re-enabling and robustly testing the full authentication flow, and performing a thorough bug bash to ensure a stable, production-ready application. The journey culminated in creating a compelling presentation to showcase the project's story and impact for the hackathon.",
            icon: <CheckCircleIcon className="w-6 h-6 text-white"/>
        },
    ];

    return (
        <div className="p-4 md:p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Our Development Journey</h1>
            <p className="text-gray-600 mb-12">From a simple idea to an AI-powered MVP in a hackathon sprint.</p>
            <div className="relative wrap overflow-hidden p-10 h-full">
                <div className="border-2-2 absolute border-opacity-20 border-gray-700 h-full border" style={{left: '50%'}}></div>
                {journeyData.map((item, index) => (
                    <div key={index} className={`mb-8 flex justify-between items-center w-full ${index % 2 === 0 ? 'flex-row-reverse left-timeline' : 'right-timeline'}`}>
                        <div className="order-1 w-5/12"></div>
                        <div className="z-20 flex items-center order-1 bg-blue-600 shadow-xl w-12 h-12 rounded-full">
                            {item.icon}
                        </div>
                        <div className="order-1 bg-white rounded-lg shadow-xl w-5/12 px-6 py-4">
                            <h3 className="font-bold text-gray-800 text-xl">{item.title}</h3>
                            <p className="text-sm leading-snug tracking-wide text-gray-600 text-opacity-100">{item.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- Main App Components ---
const MainApp = ({ user, userData }) => {
    const [page, setPage] = useState('dashboard');
    const handleLogout = async () => { await signOut(auth); };

    const Navbar = () => {
        const NavItem = ({ icon, label, pageName }) => (<button onClick={() => setPage(pageName)} className={`flex items-center space-x-3 p-3 rounded-lg w-full text-left transition-colors ${page === pageName ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>{icon}<span className="font-medium">{label}</span></button>);
        return (<div className="w-64 bg-white h-screen flex flex-col p-4 border-r border-gray-200 fixed"><div className="flex items-center space-x-2 mb-10 px-2"><GraduationCapIcon className="w-8 h-8 text-blue-600"/><span className="font-bold text-xl text-gray-800">BestPath</span></div><nav className="flex-1 space-y-2"><NavItem icon={<HomeIcon className="w-6 h-6"/>} label="Dashboard" pageName="dashboard" /><NavItem icon={<FileQuestionIcon className="w-6 h-6"/>} label="Aptitude Quiz" pageName="quiz" /><NavItem icon={<MapIcon className="w-6 h-6"/>} label="Roadmap" pageName="roadmap" /><NavItem icon={<LibraryIcon className="w-6 h-6"/>} label="Colleges" pageName="colleges" /><NavItem icon={<RocketIcon className="w-6 h-6"/>} label="Our Journey" pageName="journey" /></nav><div className="mt-auto"><button onClick={handleLogout} className="flex items-center space-x-3 p-3 rounded-lg w-full text-left text-gray-600 hover:bg-gray-100 transition-colors"><LogOutIcon className="w-6 h-6" /> <span className="font-medium">Logout</span></button></div></div>);
    };
    
    const renderPage = () => {
        switch (page) {
            case 'dashboard': return <Dashboard user={user} userData={userData} setPage={setPage} />;
            case 'quiz': return <QuizPage user={user} setPage={setPage} />;
            case 'roadmap': return <RoadmapPage userData={userData} setPage={setPage} />;
            case 'colleges': return <CollegesPage userData={userData} setPage={setPage} />;
            case 'journey': return <JourneyPage />;
            default: return <Dashboard user={user} userData={userData} setPage={setPage} />;
        }
    };

    return (<div className="antialiased text-gray-900 bg-gray-100 min-h-screen"><div className="flex"><Navbar /><main className="flex-1 ml-64">{renderPage()}</main></div></div>);
};

const App = () => {
    const [user, setUser] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [userData, setUserData] = useState(null);
    const [page, setPage] = useState('landing');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthReady(true);
            if (!currentUser) {
                setUserData(null);
                setPage('landing');
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (user) {
            const userDocRef = doc(db, 'users', user.uid);
            const unsubscribe = onSnapshot(userDocRef, (doc) => {
                if (doc.exists()) {
                    setUserData(doc.data());
                } else {
                    // This handles an edge case where a user is authenticated but their
                    // Firestore document was not created. This ensures the app doesn't hang.
                    console.warn("User authenticated but no data found. Creating placeholder document.");
                    setDoc(userDocRef, {
                        email: user.email,
                        name: user.displayName || '',
                        classLevel: '',
                        interests: '',
                        createdAt: new Date(),
                    });
                    // The onSnapshot listener will automatically pick up the new doc and set the user data.
                }
            });
            return () => unsubscribe();
        }
    }, [user]);

    if (!authReady || (user && !userData)) {
        return <LoadingSpinner fullScreen={true} />;
    }

    if (user && userData) {
        return <MainApp user={user} userData={userData} />;
    }

    switch (page) {
        case 'auth':
            return <AuthPage />;
        case 'landing':
        default:
            return <LandingPage setPage={setPage} />;
    }
};

export default App;

