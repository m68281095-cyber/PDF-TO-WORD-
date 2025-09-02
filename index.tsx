import { GoogleGenAI } from "@google/genai";
import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// This is a global variable from the showdown.js script in index.html
declare var showdown: any;

const App = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState<boolean>(false);

    const fileToGenerativePart = async (file: File) => {
        const base64EncodedDataPromise = new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
        });
        return {
            inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
        };
    };

    const handleFileChange = (selectedFile: File | null) => {
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setFile(selectedFile);
            setError(null);
            setResult(null);
        } else {
            setError('Please select a valid PDF file.');
            setFile(null);
        }
    };

    const handleConvert = async () => {
        if (!file) {
            setError('Please select a file first.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const filePart = await fileToGenerativePart(file);

            // --- Step 1: Initial Conversion ---
            setLoadingMessage('Step 1 of 3: Performing initial conversion...');
            const promptStep1 = `
You are an expert document transcriber specializing in converting complex, bilingual (English and Bengali) PDF documents into flawless GitHub Flavored Markdown.

Your task is to perform a high-fidelity OCR and conversion of the provided PDF. The final output must be a single, clean Markdown document that is a perfect digital representation of the original.

Pay meticulous attention to the following details:
1.  **Bilingual Accuracy:** Transcribe all English and Bengali text with extreme precision. Ensure all characters, including compound characters (যুক্তাক্ষর) in Bengali, are rendered correctly.
2.  **Structural Integrity:** Replicate the heading hierarchy, paragraphs, and emphasis (bold, italic).
3.  **Complex Elements:** Reconstruct all tables using GitHub Flavored Markdown.
4.  **List Integrity:** Accurately replicate all ordered (numbered), unordered (bulleted), and nested lists. Preserve the exact indentation and nesting levels as seen in the original document.
5.  **Mathematical Equations & Special Symbols:** Transcribe all mathematical and scientific notations directly into their corresponding standard Unicode characters (e.g., √x instead of LaTeX).
6.  **Final Output:** The output MUST be **only** the final, clean Markdown text. Do NOT include any commentary or explanations.`;

            const responseStep1 = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: promptStep1 }, filePart] },
            });
            
            const markdownStep1 = responseStep1.text;
            if (!markdownStep1) {
                throw new Error("Step 1 (Initial Conversion) failed or returned empty.");
            }

            // --- Step 2: Verification & Correction ---
            setLoadingMessage('Step 2 of 3: Verifying and correcting the document...');
            const promptStep2 = `
You are a meticulous document proofreader and quality control specialist. You have been given an original PDF document and a Markdown text that was generated from it via OCR.

Your task is to **compare the provided Markdown text against the original PDF** and correct any and all errors.

**Instructions:**
1.  **Cross-Reference:** Carefully examine the PDF and the Markdown side-by-side.
2.  **Correct Errors:** Fix any mistakes in the Markdown text. This includes:
    *   **OCR Errors:** Misspelled words, incorrect characters, especially in complex Bengali যুক্তাক্ষর.
    *   **Formatting Errors:** Incorrect heading levels or broken tables. Pay special attention to **list formatting**. Ensure that ordered (numbered), unordered (bulleted), and nested lists are perfectly structured with correct indentation. Fix any improperly formatted lists or missed bold/italic text.
    *   **Structural Errors:** Missing paragraphs, incorrect line breaks.
    *   **Symbol Errors:** Ensure all mathematical and special symbols are correct Unicode characters as seen in the PDF.
3.  **Output:** Your output MUST be **only** the fully corrected, clean Markdown text. Do not add any commentary, notes, or explanations.`;
            
            const responseStep2 = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [
                    { text: promptStep2 },
                    filePart,
                    { text: "\n\n--- OCR-GENERATED MARKDOWN TO BE VERIFIED ---\n\n" + markdownStep1 }
                ]},
            });

            const markdownStep2 = responseStep2.text;
            if (!markdownStep2) {
                throw new Error("Step 2 (Verification) failed or returned empty.");
            }

            // --- Step 3: Final Polish ---
            setLoadingMessage('Step 3 of 3: Applying final polish...');
            const promptStep3 = `
You are a final quality assurance specialist performing the last check on a document conversion. You have been given an original PDF and a corrected Markdown version.

Your task is to conduct a **final, exhaustive review** to ensure the Markdown is a perfect, flawless representation of the PDF.

**Instructions:**
1.  **Final Scrutiny:** This is the last chance to catch any errors. Pay extreme attention to the smallest details.
2.  **Perfection Check:** Verify headings, tables, bilingual text (English and Bengali), and all special symbols one last time. Give special scrutiny to **all lists**. Ensure that all bullet points, numbered items, and nested sub-lists are perfectly formatted and indented, exactly mirroring the PDF's structure.
3.  **Clean Output:** Your output MUST be **only** the final, polished Markdown text. Do not include any explanations or introductory phrases. The goal is a perfect, ready-to-use document.`;

            const responseStep3 = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [
                    { text: promptStep3 },
                    filePart,
                    { text: "\n\n--- CORRECTED MARKDOWN FOR FINAL POLISH ---\n\n" + markdownStep2 }
                ]},
            });

            const finalResult = responseStep3.text;
            if (!finalResult) {
                throw new Error("Step 3 (Final Polish) failed or returned empty.");
            }

            setResult(finalResult);

        } catch (err: any) {
            setError(`Error processing file: ${err.message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const handleDownload = () => {
        if (!result) return;

        const converter = new showdown.Converter();
        converter.setOption('tables', true); // Explicitly enable table parsing
        const htmlContent = converter.makeHtml(result);

        const header = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' 
                  xmlns:w='urn:schemas-microsoft-com:office:word' 
                  xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset='utf-8'>
                <title>Export HTML to Word</title>
                <style>
                    table {
                        border-collapse: collapse;
                        width: 100%;
                    }
                    th, td {
                        border: 1px solid black;
                        padding: 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #f2f2f2;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>`;
        const footer = "</body></html>";
        const sourceHTML = header + htmlContent + footer;

        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = source;
        const fileName = file?.name.replace('.pdf', '.doc') || 'document.doc';
        fileDownload.download = fileName;
        fileDownload.click();
        document.body.removeChild(fileDownload);
    };
    
    // Drag and Drop handlers
    const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation(); // Necessary to allow drop
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };

    const renderResultPreview = () => {
        if (!result) return null;
        const converter = new showdown.Converter();
        converter.setOption('tables', true);
        const html = converter.makeHtml(result);
        return (
            <div className="result-preview">
                <h2>Preview</h2>
                <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
        );
    };

    return (
        <div className="app-container">
            <header>
                <h1>PDF to Word Converter</h1>
                <p>Upload a PDF, and we'll convert it to an editable Word document using AI.</p>
            </header>

            <label
                htmlFor="file-input"
                className={`upload-area ${isDragging ? 'drag-over' : ''}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                aria-label="Upload PDF file"
            >
                <input
                    type="file"
                    id="file-input"
                    accept="application/pdf"
                    onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
                />
                <p><strong>Click to upload</strong> or drag and drop your PDF here.</p>
            </label>

            {file && <p className="file-info">Selected file: {file.name}</p>}

            <div className="actions">
                <button className="btn" onClick={handleConvert} disabled={!file || isLoading}>
                    {isLoading ? 'Converting...' : 'Convert to Word'}
                </button>
            </div>

            {isLoading && (
                <div>
                    <div className="loader"></div>
                    <p className="loading-text">{loadingMessage || 'AI is processing your document...'}</p>
                </div>
            )}

            {error && <p className="error-message">{error}</p>}
            
            {result && !isLoading && (
                <>
                    {renderResultPreview()}
                    <div style={{ marginTop: '1.5rem' }}>
                        <button className="btn btn-secondary" onClick={handleDownload}>
                            Download Word File
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);