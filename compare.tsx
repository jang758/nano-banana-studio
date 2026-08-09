import React from 'react';
import ReactDOM from 'react-dom/client';
import CompareApp from './CompareApp';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('앱 루트 요소를 찾을 수 없습니다.');
ReactDOM.createRoot(root).render(<React.StrictMode><CompareApp /></React.StrictMode>);

