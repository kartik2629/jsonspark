import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button, Container, Card, Form, Alert, Spinner, ListGroup } from 'react-bootstrap';
import { faBolt, faTrash, faEye, faCopy, faCheck, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import Editor from '@monaco-editor/react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://jsonspark.onrender.com';

function App() {
  const [name, setName] = useState('');
  const [jsonInput, setJsonInput] = useState('{\n  "example": "data"\n}');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('light');
  const [loading, setLoading] = useState(false);
  const [endpoints, setEndpoints] = useState([]);
  const [copied, setCopied] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const editorRef = useRef(null);

  // Theme detection
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setMode(savedTheme || (prefersDark ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/`);
      setEndpoints(response.data.endpoints);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const toggleTheme = () => {
    const newMode = mode === 'light' ? 'dark' : 'light';
    setMode(newMode);
    localStorage.setItem('theme', newMode);
  };

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value) => {
    setJsonInput(value);
  };

  const validateJson = () => {
    try {
      return JSON.parse(jsonInput);
    } catch (err) {
      throw new Error('❌ Invalid JSON: ' + err.message);
    }
  };

  const handleGenerate = async () => {
    setResponse('');
    setError('');
    setLoading(true);

    try {
      const parsedJson = validateJson();
      const result = await axios.post(`${API_BASE_URL}/create`, {
        name,
        jsonData: JSON.stringify(parsedJson),
        slug: name
      });

      setResponse(JSON.stringify(result.data, null, 2));
      fetchEndpoints();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrettify = () => {
    try {
      const model = editorRef.current.getModel();
      const currentValue = model.getValue();
      const formatted = JSON.stringify(JSON.parse(currentValue), null, 2);
      
      editorRef.current.setValue(formatted);
      setJsonInput(formatted);
      setError('');
    } catch {
      setError('❌ Invalid JSON: cannot prettify');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`app-container ${mode}`}>
      <Container>
        <div className="d-flex justify-content-between align-items-center my-4">
          <h1 className="mb-0">
            <FontAwesomeIcon 
              icon={faBolt} 
              className="me-2 text-primary"
              bounce={isHovering}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            />
            JSONSpark
          </h1>
          <Button
            variant="outline-primary"
            onClick={toggleTheme}
            className="theme-toggle"
          >
            {mode === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </Button>
        </div>

        <Card className="shadow-lg mb-4">
          <Card.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Endpoint Name</Form.Label>
                <Form.Control
                  placeholder="e.g., users, products, todos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Form.Text className="text-muted">
                  Your API endpoint: {API_BASE_URL}/{name || 'your-endpoint'}
                </Form.Text>
              </Form.Group>

              <Form.Group className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label>JSON Data</Form.Label>
                  <Button 
                    variant="outline-primary" 
                    size="sm" 
                    onClick={handlePrettify}
                  >
                    <FontAwesomeIcon icon={faWandMagicSparkles} className="me-2" />
                    Format JSON
                  </Button>
                </div>
                <div className="editor-container">
                  <Editor
                    height="300px"
                    defaultLanguage="json"
                    value={jsonInput}
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    theme={mode === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 14,
                      wordWrap: 'on',
                      automaticLayout: true,
                      tabSize: 2,
                      formatOnPaste: true,
                      formatOnType: true,
                      lineNumbers: 'on',
                      folding: true,
                      lineDecorationsWidth: 10,
                      contextmenu: true,
                      autoClosingBrackets: 'always',
                      autoClosingQuotes: 'always',
                      suggestOnTriggerCharacters: true,
                      renderWhitespace: 'selection',
                      renderControlCharacters: true
                    }}
                  />
                </div>
              </Form.Group>

              <div className="d-flex flex-wrap gap-2 mb-3">
                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  disabled={loading || !name}
                >
                  {loading ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Generating...
                    </>
                  ) : (
                    '✨ Generate API Endpoint'
                  )}
                </Button>
              </div>

              {name && (
                <div className="mb-3 d-flex gap-2">
                  <Button
                    variant="outline-primary"
                    onClick={() => window.open(`${API_BASE_URL}/${name}`, '_blank')}
                  >
                    <FontAwesomeIcon icon={faEye} className="me-2" />
                    View Endpoint
                  </Button>
                  <Button
                    variant="outline-secondary"
                    onClick={() => copyToClipboard(`${API_BASE_URL}/${name}`)}
                  >
                    <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="me-2" />
                    {copied ? 'Copied!' : 'Copy URL'}
                  </Button>
                </div>
              )}
            </Form>

            {response && (
              <Alert variant="success" className="mt-4">
                <div className="editor-container">
                  <Editor
                    height="200px"
                    defaultLanguage="json"
                    value={response}
                    theme={mode === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      lineNumbers: 'off',
                      folding: false,
                      renderWhitespace: 'none',
                      lineDecorationsWidth: 0,
                      contextmenu: false
                    }}
                  />
                </div>
              </Alert>
            )}

            {error && (
              <Alert variant="danger" className="mt-4">
                {error}
              </Alert>
            )}
          </Card.Body>
        </Card>

        {endpoints.length > 0 && (
          <Card className="shadow">
            <Card.Body>
              <Card.Title>Your API Endpoints</Card.Title>
              <ListGroup variant="flush">
                {endpoints.map((ep) => (
                  <ListGroup.Item 
                    key={ep.slug} 
                    className="d-flex justify-content-between align-items-center"
                  >
                    <div>
                      <strong>{ep.name}</strong>
                      <div className="small text-muted">
                        {API_BASE_URL}/{ep.slug}
                      </div>
                      <div className="small text-muted">
                        Created: {new Date(ep.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => {
                          axios.delete(`${API_BASE_URL}/${ep.slug}`)
                            .then(() => fetchEndpoints());
                        }}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </Button>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card.Body>
          </Card>
        )}
      </Container>
    </div>
  );
}

export default App;
