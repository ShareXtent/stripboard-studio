$lines = Get-Content 'src\components\ComponentLibraryPanel.tsx'
$newLines = @()
foreach ($line in $lines) {
    if ($line -match 'import.*ComponentDefinition.*generateId') {
        $newLines += "import { ComponentDefinition } from '../model/types';"
        $newLines += "import { generateId } from '../utils/ids';"
    } else {
        $newLines += $line
    }
}
$newLines | Set-Content 'src\components\ComponentLibraryPanel.tsx'
