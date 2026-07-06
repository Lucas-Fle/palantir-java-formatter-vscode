# Palantir Java Format for VS Code

Extension VS Code de formatage Java local fondée sur
[Palantir Java Format](https://github.com/palantir/palantir-java-format).

> **Projet communautaire non officiel.** Cette extension n’est ni développée,
> ni approuvée, ni sponsorisée par Palantir Technologies.

Version de Palantir Java Format embarquée : **2.91.0**

## Fonctionnalités

- formatage complet des documents Java ;
- réorganisation et espacement des imports ;
- suppression des imports inutilisés ;
- traitement standard des chaînes longues ;
- formatage à la demande ou à l’enregistrement ;
- exécution entièrement locale, sans port ni appel réseau pendant le formatage ;
- worker Java persistant pour éviter de redémarrer la JVM à chaque document.

Le formatage repose sur l’API
`FormatterService.formatSourceReflowStringsAndFixImports` de Palantir Java
Format. La version embarquée est fixe afin de garantir un résultat reproductible.

## Prérequis

- VS Code 1.96 ou ultérieur ;
- un JDK 17 ou ultérieur.

Maven, Gradle et un dépôt Palantir ne sont pas nécessaires pour utiliser
l’extension. Le VSIX contient le worker et Palantir Java Format dans un JAR
autonome.

## Installation

### Depuis un VSIX

1. Télécharger ou construire le fichier
   `palantir-java-format-<version>.vsix`.
2. Dans VS Code, ouvrir la vue **Extensions**.
3. Ouvrir le menu `…`, sélectionner **Install from VSIX…**, puis choisir le
   fichier.

L’installation peut aussi être réalisée en ligne de commande :

```shell
code --install-extension ./palantir-java-format-VERSION.vsix
```

Pour construire le VSIX depuis les sources, consulter la section
[Développement](#développement).

## Démarrage rapide

Définir l’extension comme formateur Java par défaut dans les paramètres VS Code :

```json
{
  "[java]": {
    "editor.defaultFormatter": "lucasfleury.palantir-java-format",
    "editor.formatOnSave": true
  }
}
```

Il est également possible de lancer **Format Document** depuis la palette de
commandes sans activer le formatage à l’enregistrement.

Si plusieurs formateurs Java sont installés, utiliser **Format Document With…**
puis **Configure Default Formatter…** pour sélectionner cette extension.

## Configuration

| Paramètre | Type | Valeur par défaut | Description |
| --- | --- | --- | --- |
| `palantirJavaFormat.enabled` | booléen | `true` | Active le provider de formatage Java. |
| `palantirJavaFormat.javaHome` | chaîne | `""` | Racine du JDK utilisé par le worker. |
| `palantirJavaFormat.jvmArgs` | tableau de chaînes | `[]` | Arguments JVM supplémentaires placés avant `-jar`. |

Exemple complet :

```json
{
  "[java]": {
    "editor.defaultFormatter": "lucasfleury.palantir-java-format",
    "editor.formatOnSave": true
  },
  "palantirJavaFormat.enabled": true,
  "palantirJavaFormat.javaHome": "",
  "palantirJavaFormat.jvmArgs": []
}
```

Java est sélectionné dans cet ordre :

1. `palantirJavaFormat.javaHome` ;
2. `JAVA_HOME` ;
3. `java` (`java.exe` sous Windows) dans le `PATH`.

`javaHome` doit désigner la racine du JDK, et non le binaire Java. La version du
JDK est contrôlée avant le démarrage du worker. Chaque entrée de `jvmArgs` est
transmise comme un argument distinct.

## Commandes

Les commandes suivantes sont disponibles dans la palette :

- **Palantir Java Format: Restart Worker** ;
- **Palantir Java Format: Show Output** ;
- **Palantir Java Format: Show Version**.

## Dépannage

Les diagnostics de l’extension et la sortie d’erreur du worker sont disponibles
dans le canal **Output > Palantir Java Format**.

En cas d’échec :

1. vérifier qu’un JDK 17 ou ultérieur est accessible ;
2. contrôler `palantirJavaFormat.javaHome`, `JAVA_HOME` et le `PATH` ;
3. exécuter **Palantir Java Format: Restart Worker** ;
4. consulter le canal de sortie.

Après un crash, les requêtes en cours sont rejetées et jusqu’à trois
redémarrages automatiques avec backoff sont tentés.

Les bugs et demandes d’évolution sont suivis dans les
[issues GitHub](https://github.com/Lucas-Fle/palantir-java-format-vscode/issues).
Lors du signalement, indiquer les versions de l’extension, de VS Code et du JDK,
le système d’exploitation, les paramètres `palantirJavaFormat` utilisés et les
logs pertinents.

## Confidentialité et sécurité

Les documents sont transmis uniquement au worker Java local par `stdin` et
`stdout`. Aucun port réseau n’est ouvert et aucun appel réseau n’est effectué
pendant le formatage. Le contenu des documents n’est pas journalisé par
l’extension.

Ne pas inclure de code source confidentiel, de jeton ou de donnée personnelle
dans un rapport public. Les vulnérabilités doivent être signalées conformément à
la [politique de sécurité](SECURITY.md).

## Architecture

```text
VS Code / TypeScript
    │ JSONL v1 sur stdin/stdout
    ▼
worker Java persistant
    │ ServiceLoader<FormatterService>
    ▼
Palantir Java Format 2.91.0
```

- `extension/` contient le provider VS Code, le client protocolaire et le cycle
  de vie du processus ;
- `worker/` contient le projet Maven Java 17 produisant le JAR exécutable ;
- `protocol/protocol.schema.json` décrit les messages ;
- `scripts/` automatise le build, les contrôles de version et le packaging VSIX.

Le worker démarre à la première demande de formatage, reste actif entre les
documents et s’arrête avec l’extension.

## Développement

L’environnement de développement nécessite Node.js 22, un JDK 17 ou ultérieur
et Git.

Installer les dépendances et lancer la vérification complète :

```shell
npm ci
npm run package
```

Cette commande :

1. compile et teste le worker avec le Maven Wrapper ;
2. exécute le JAR et vérifie la version de Palantir annoncée ;
3. refuse un JAR absent ou plus ancien que ses sources ;
4. exécute le lint, le type-check, les tests TypeScript et les tests VS Code ;
5. crée `artifacts/palantir-java-format-<version>.vsix` ;
6. vérifie que le worker et les notices légales figurent dans le VSIX.

Sous Linux sans session graphique :

```shell
xvfb-run -a npm run package
```

Le Maven Wrapper utilise Maven 3.9.11 ; aucune installation globale de Maven
n’est nécessaire :

```shell
cd worker
./mvnw clean package
```

Sous Windows :

```powershell
cd worker
.\mvnw.cmd clean package
```

Pour tester l’extension avec `F5`, exécuter `npm ci`, puis utiliser la
configuration **Run Extension**. La tâche **Build for F5** construit le worker et
l’extension avant d’ouvrir l’Extension Development Host.

Les règles de contribution sont détaillées dans
[CONTRIBUTING.md](CONTRIBUTING.md).

## Protocole

Chaque ligne échangée est un objet JSON UTF-8. Les méthodes de la version 1 sont
`initialize`, `formatDocument` et `shutdown`. Chaque requête possède un
identifiant unique et les erreurs utilisent des codes stables. `stdout` est
réservé au protocole ; les logs du worker sont écrits sur `stderr`.

Voir [protocol/protocol.schema.json](protocol/protocol.schema.json).

## Licence et attributions

Ce projet est distribué sous licence
[Apache License 2.0](LICENSE). Les licences et attributions des composants
embarqués sont documentées dans
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) et conservées dans les
artefacts distribués.
