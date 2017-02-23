import * as ko from "knockout";
import {LoadModal, LoadFileEvent} from "./view_models/load_modal";
import {ModelProxy, ModelLevel} from "./main/model_proxy";
import {remote} from "electron";
import {ApiModellerWindow} from "./main/api_modeller_window";
import {Nav} from "./view_models/nav";
import IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
import createModel = monaco.editor.createModel;
import {Document, Fragment, Module} from "./main/units_model";
import {label} from "./utils";

export type NavigatorSection = "files" | "logic";
export type EditorSection = "raml" | "open-api" | "api-model";

export interface ReferenceFile {
    id: string;
    label: string;
    type: "local" | "remote"
}

export class ViewModel {

    public navigatorSection: KnockoutObservable<NavigatorSection> = ko.observable<NavigatorSection>("files");
    public editorSection: KnockoutObservable<EditorSection> = ko.observable<EditorSection>("raml");
    public references: KnockoutObservableArray<ReferenceFile> = ko.observableArray<ReferenceFile>([]);
    public selectedReference: KnockoutObservable<ReferenceFile|null> = ko.observable<ReferenceFile|null>(null);
    public documentUnits: KnockoutObservableArray<Document[]> = ko.observableArray<Document[]>([]);
    public fragmentUnits: KnockoutObservableArray<Fragment[]> = ko.observableArray<Fragment[]>([]);
    public moduleUnits: KnockoutObservableArray<Module[]> = ko.observableArray<Module[]>([]);
    public nav: Nav = new Nav("document");
    public loadModal: LoadModal = new LoadModal();
    public documentLevel: ModelLevel = "document";
    public documentModel?: ModelProxy = undefined;
    public model?: ModelProxy = undefined;

    constructor(public editor: IStandaloneCodeEditor) {
        // events we are subscribed
        this.loadModal.on(LoadModal.LOAD_FILE_EVENT, (data: LoadFileEvent) => {
            this.apiModellerWindow().parseModelFile(data.type, data.location, (err, model) => {
                if (err) {
                    console.log(err);
                    alert(err);
                } else {
                    this.documentModel = model;
                    this.model = model;
                    this.resetUnits();
                    this.resetDocuments();
                }
            });
        });
        this.nav.on(Nav.DOCUMENT_LEVEL_SELECTED_EVENT, (level: ModelLevel) => {
            this.onDocumentLevelChange(level)
        });
        this.editorSection.subscribe((section) => this.onEditorSectionChange(section));
    }

    protected apiModellerWindow(): ApiModellerWindow { return remote.getCurrentWindow() as ApiModellerWindow; }

    apply(location: Node) {
        window["viewModel"] = this;
        ko.applyBindings(this);
    }

    private onDocumentLevelChange(level: ModelLevel) {
        console.log(`** New document level ${level}`);
        this.documentLevel = level;
        this.resetDocuments();
    }

    // Reset the view model state when a document has changed
    private resetDocuments(resetReferences = true) {
        if (this.model != null) {

            // we reset the list of references for this model
            if (resetReferences) { this.resetReferences(); }

            // We generate the RAML representation
            this.model.toRaml(this.documentLevel,(err, string) => {
                if (err != null) {
                    console.log("Error generating RAML");
                    console.log(err);
                } else {
                    if (this.editorSection() === "raml") {
                        this.editor.setModel(createModel(this.model!.ramlString, "yaml"));
                    }
                }
            });

            // We generate the OpenAPI representation
            this.model.toOpenAPI(this.documentLevel, (err, string) => {
                if (err != null) {
                    console.log("Error getting OpenAPI");
                    console.log(err);
                } else {
                    if (this.editorSection() === "open-api") {
                        this.editor.setModel(createModel(this.model!.openAPIString, "json"));
                    }
                }
            });

            // We generate the APIModel representation
            this.model.toAPIModel(this.documentLevel, (err, string) => {
                if (err != null) {
                    console.log("Error getting ApiModel");
                    console.log(err);
                } else {
                    if (this.editorSection() === "api-model") {
                        this.editor.setModel(createModel(this.model!.apiModeltring, "json"));
                    }
                }
            });
        }
    }

    private onEditorSectionChange(section: EditorSection) {
        // Warning, models here mean MONACO EDITOR MODELS, don't get confused with API Models
        if (section === "raml") {
            if (this.model != null) {
                this.editor.setModel(createModel(this.model.ramlString, "yaml"));
            } else {
                this.editor.setModel(createModel("# no model loaded", "yaml"));
            }
        } else if (section == "open-api") {
            if (this.model != null) {
                this.editor.setModel(createModel(this.model!.openAPIString, "json"));
            } else {
                this.editor.setModel(createModel("// no model loaded", "json"));
            }
        } else {
            if (this.model != null) {
                this.editor.setModel(createModel(this.model!.apiModeltring, "json"));
            } else {
                this.editor.setModel(createModel("// no model loaded", "json"));
            }
        }
    }

    // Reset the list of references for the current model
    private resetReferences() {
        console.log("Setting references");
        if (this.model != null) {
            const location = this.model.location();
            this.selectedReference(this.makeReference(location, location));
            if (this.documentLevel === "document") {
                this.references.removeAll();
                this.model.references().forEach(ref => this.references.push(this.makeReference(location, ref)));
            } else {
                this.references.removeAll();
                this.references.push(this.makeReference(location, this.model.location()))
            }
        }
        console.log("TOTAL REFERENCES " + this.references.length);
    }

    private makeReference(currentLocation: string, reference: string): ReferenceFile {
        console.log("*** Making reference " + reference);
        const parts = currentLocation.split("/");
        parts.pop();
        const currentLocationDir = parts.join("/") + "/";
        const isRemote = reference.startsWith("http");
        if (reference.startsWith(currentLocationDir)) {
            return {
                type: (isRemote ? "remote" : "local"),
                id: reference,
                label: label(reference)
            }
        } else {
            const refParts = reference.split("/");
            /*
            let name;
            if ( refParts.length > 3 ) {
                const n = refParts.pop();
                const n1 = refParts.pop();
                name = `.../${n1}/${n}`;
            } else {
                name = refParts.join("/");
            }
            */
            return {
                type: (isRemote ? "remote" : "local"),
                id: reference,
                label: label(reference),
            }
        }
    }

    public selectNavigatorFile(reference: ReferenceFile) {
        this.selectedReference(reference);
        if (this.documentModel != null) {
            if (this.documentModel.location() !== reference.id) {
                this.model = this.documentModel.nestedModel(reference.id);
            } else {
                this.model =  this.documentModel;
            }
            this.resetDocuments(false)
        }
    }

    private resetUnits() {
        if (this.documentModel != null && this.documentLevel === "document") {
            this.documentModel.units((err, units) => {
                if (err == null) {
                    this.documentUnits.removeAll();
                    units.documents.forEach(doc => this.documentUnits.push(doc));
                    this.fragmentUnits.removeAll();
                    units.fragments.forEach(fragment => this.fragmentUnits.push(fragment));
                    this.moduleUnits.removeAll();
                    units.modules.forEach(module => this.moduleUnits.push(module));
                }
            })
        }
    }
}