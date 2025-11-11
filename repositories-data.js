// Repositories Data Management
// This file handles saving and loading repository data to/from a JSON file
// Data is stored in repositories-data.json file and is visible to all users
// Uses GitHub API for saving (if configured) or localStorage as fallback

const REPOSITORIES_DATA_FILE = 'repositories-data.json';
const MAX_TABLE_ROWS = 100; // Show only first 100 repositories in table

// GitHub API configuration (optional - for saving to file)
// To enable: follow instructions in GITHUB_API_SETUP.md
// 
// ШАГ 1: Создайте GitHub Personal Access Token
//   - GitHub.com → Settings → Developer settings → Personal access tokens → Generate new token
//   - Выберите scope: "repo" (полный доступ к репозиториям)
//   - Скопируйте токен (показывается только один раз!)
//
// ШАГ 2: Заполните значения ниже:
const GITHUB_CONFIG = {
    token: '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', // GitHub Personal Access Token
    owner: 'danielmercerr', // GitHub username
    repo: 'realitymashsite',  // Название репозитория
    branch: 'main' // Ветка (обычно 'main' или 'master')
};

// Get repositories data from JSON file (shared for all users)
async function getRepositoriesData() {
    try {
        // Always try to load from the shared JSON file first
        // This ensures all users see the same data
        const response = await fetch(REPOSITORIES_DATA_FILE + '?t=' + Date.now()); // Cache busting
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                // Data loaded from file - this is the source of truth for all users
                console.log(`Loaded ${data.length} repositories from shared file`);
                return data;
            }
        }
        
        // If file is empty or doesn't exist yet, return empty array
        // Don't use localStorage as it's user-specific
        console.log('Shared file is empty or not found, returning empty array');
        return [];
    } catch (error) {
        console.error('Error loading repositories data from file:', error);
        // Only use localStorage as last resort if file completely fails to load
        // But prefer empty array to ensure consistency
        try {
            const cached = localStorage.getItem('repositories-data-backup');
            if (cached) {
                const parsed = JSON.parse(cached);
                console.warn('Using localStorage backup (file unavailable)');
                return Array.isArray(parsed) ? parsed : [];
            }
        } catch (e) {
            console.error('Error loading from localStorage backup:', e);
        }
        return [];
    }
}

// Save repositories data to JSON file using GitHub API (shared for all users)
async function saveRepositoriesToFile(repositories) {
    try {
        // Try to save via GitHub API first (this is the main storage for all users)
        if (GITHUB_CONFIG.token && GITHUB_CONFIG.owner && GITHUB_CONFIG.repo) {
            try {
                await saveViaGitHubAPI(repositories);
                console.log(`✅ Data saved to GitHub repository (${repositories.length} repositories)`);
                
                // Also backup to localStorage as fallback (but file is the source of truth)
                localStorage.setItem('repositories-data-backup', JSON.stringify(repositories));
                return true;
            } catch (error) {
                console.error('❌ Failed to save via GitHub API:', error);
                // If GitHub API fails, still save to localStorage as temporary backup
                localStorage.setItem('repositories-data-backup', JSON.stringify(repositories));
                throw error; // Re-throw to indicate failure
            }
        }
        
        // If GitHub API not configured, save to localStorage as temporary storage
        // But warn user that data won't be shared across devices/users
        console.warn('⚠️ GitHub API not configured. Data saved to localStorage only (not shared with other users).');
        localStorage.setItem('repositories-data-backup', JSON.stringify(repositories));
        return false; // Return false to indicate data is not in shared storage
    } catch (error) {
        console.error('Error saving repositories data:', error);
        // Last resort: save to localStorage
        localStorage.setItem('repositories-data-backup', JSON.stringify(repositories));
        return false;
    }
}

// Save data via GitHub API
async function saveViaGitHubAPI(repositories) {
    const { token, owner, repo, branch } = GITHUB_CONFIG;
    
    // Get current file SHA (required for update)
    const getFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${REPOSITORIES_DATA_FILE}?ref=${branch}`;
    const getFileResponse = await fetch(getFileUrl, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    let sha = null;
    if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        sha = fileData.sha;
    }
    
    // Prepare file content
    const content = JSON.stringify(repositories, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(content)));
    
    // Create or update file
    const updateFileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${REPOSITORIES_DATA_FILE}`;
    const updateResponse = await fetch(updateFileUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: `Update repositories data - ${new Date().toISOString()}`,
            content: encodedContent,
            branch: branch,
            sha: sha // If null, file will be created; if exists, file will be updated
        })
    });
    
    if (!updateResponse.ok) {
        const error = await updateResponse.json();
        throw new Error(`GitHub API error: ${error.message || 'Unknown error'}`);
    }
    
    return true;
}

// Add or update repository in data
async function saveRepositoryToFile(repoUrl, username, repoName, metrics, repoData, solanaWallet = '') {
    const repositories = await getRepositoriesData();
    
    // Check if repository already exists
    const existingIndex = repositories.findIndex(repo => repo.url === repoUrl);
    
    // Ensure quality score is between 1 and 1000
    const qualityScore = Math.max(1, Math.min(1000, Math.round(metrics.quality)));
    
    // Get existing wallet if repository already exists
    let existingWallet = solanaWallet;
    if (existingIndex !== -1 && !solanaWallet) {
        existingWallet = repositories[existingIndex].solanaWallet || '';
    }
    
    const repositoryData = {
        url: repoUrl,
        username: username,
        name: repoName,
        description: repoData.description || 'No description available',
        solanaWallet: existingWallet,
        metrics: {
            uniqueness: metrics.uniqueness,
            quality: qualityScore,
            marketDemand: metrics.marketDemand,
            hourlyEarnings: metrics.hourlyEarnings,
            rentalPrice: metrics.rentalPrice,
            royaltyRate: metrics.royaltyRate,
            annualRevenue: metrics.annualRevenue,
            stars: metrics.stars,
            forks: metrics.forks,
            watchers: metrics.watchers
        },
        evaluatedAt: new Date().toISOString(),
        combinedScore: qualityScore + (metrics.hourlyEarnings / 100)
    };
    
    if (existingIndex !== -1) {
        // Update existing repository
        repositories[existingIndex] = repositoryData;
    } else {
        // Add new repository
        repositories.push(repositoryData);
    }
    
    // Save to file
    await saveRepositoriesToFile(repositories);
    
    return repositories;
}

// Update wallet address for a repository
async function updateRepositoryWallet(repoUrl, walletAddress) {
    const repositories = await getRepositoriesData();
    const existingIndex = repositories.findIndex(repo => repo.url === repoUrl);
    
    if (existingIndex !== -1) {
        repositories[existingIndex].solanaWallet = walletAddress;
        await saveRepositoriesToFile(repositories);
        return true;
    }
    return false;
}

// Get repositories sorted by Potential Earnings
async function getRepositoriesSorted() {
    const repositories = await getRepositoriesData();
    // Sort by Potential Earnings (hourlyEarnings) in descending order
    repositories.sort((a, b) => b.metrics.hourlyEarnings - a.metrics.hourlyEarnings);
    return repositories;
}

// Get repositories for table display (first 100)
async function getRepositoriesForTable() {
    const repositories = await getRepositoriesSorted();
    return {
        displayed: repositories.slice(0, MAX_TABLE_ROWS),
        total: repositories.length,
        hasMore: repositories.length > MAX_TABLE_ROWS
    };
}

// Initialize repositories data (for compatibility)
async function initializeRepositoriesData() {
    return await getRepositoriesData();
}
