<?php

declare(strict_types=1);

it('ships only runtime package files in the composer archive', function (): void {
    $repositoryRoot = dirname(__DIR__, 2);
    $gitDirectory = $repositoryRoot.DIRECTORY_SEPARATOR.'.git';

    if (! is_dir($gitDirectory) && ! is_file($gitDirectory)) {
        $this->markTestSkipped('The composer archive test requires a Git checkout.');
    }

    if (! extension_loaded('zip')) {
        $this->markTestSkipped('The zip extension is required to inspect the composer archive.');
    }

    $pipes = [];
    $process = proc_open(
        ['git', 'archive', '--format=zip', '--worktree-attributes', 'HEAD'],
        [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ],
        $pipes,
        $repositoryRoot,
    );

    if (! is_resource($process)) {
        throw new RuntimeException('Unable to start git archive.');
    }

    fclose($pipes[0]);
    $archive = stream_get_contents($pipes[1]);
    $errorOutput = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    $exitCode = proc_close($process);

    expect($exitCode)->toBe(0, $errorOutput ?: 'git archive failed.');

    if (! is_string($archive)) {
        throw new RuntimeException('Unable to read the git archive.');
    }

    $archivePath = sys_get_temp_dir().DIRECTORY_SEPARATOR.'inertia-datatables-'.bin2hex(random_bytes(8)).'.zip';

    if (file_put_contents($archivePath, $archive) === false) {
        throw new RuntimeException('Unable to write the git archive to disk.');
    }

    $zip = new ZipArchive;
    $opened = $zip->open($archivePath);

    if ($opened !== true) {
        unlink($archivePath);

        throw new RuntimeException("Unable to open the git archive: {$opened}");
    }

    $topLevelEntries = [];

    for ($index = 0; $index < $zip->numFiles; $index++) {
        $entry = $zip->getNameIndex($index);

        if ($entry === false) {
            continue;
        }

        $topLevelEntries[] = explode('/', $entry)[0];
    }

    $zip->close();
    unlink($archivePath);

    $topLevelEntries = array_values(array_unique($topLevelEntries));
    sort($topLevelEntries);

    expect($topLevelEntries)->toBe([
        'CHANGELOG.md',
        'LICENSE.md',
        'README.md',
        'composer.json',
        'config',
        'src',
    ]);
});
